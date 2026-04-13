from collections import defaultdict, deque
from datetime import datetime, timezone, timedelta
from difflib import SequenceMatcher
from email.message import EmailMessage
import json
import os
import random
import re
import smtplib
import sqlite3
import ssl
import string
import types
from urllib import error as urllib_error
from urllib import request as urllib_request

import bcrypt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from groq import Groq
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

load_dotenv()

# passlib 1.7.x expects bcrypt.__about__.__version__, which is removed in bcrypt>=5.
# Provide a tiny compatibility shim so password hash/verify keeps working in production.
if not hasattr(bcrypt, "__about__"):
    bcrypt.__about__ = types.SimpleNamespace(__version__=getattr(bcrypt, "__version__", ""))

APP_ENV = os.getenv("APP_ENV", "development").lower()
SECRET_KEY = os.getenv("SECRET_KEY", "")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_PASS = os.getenv("SMTP_PASS", "").strip()
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER).strip()
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
OTP_FROM_EMAIL = os.getenv("OTP_FROM_EMAIL", SMTP_FROM).strip()
BREVO_API_KEY = os.getenv("BREVO_API_KEY", "").strip()
BREVO_FROM_EMAIL = os.getenv("BREVO_FROM_EMAIL", OTP_FROM_EMAIL).strip()

if APP_ENV == "production" and (not SECRET_KEY or SECRET_KEY == "supersecretkey_changeme"):
    raise RuntimeError("SECRET_KEY must be set to a strong value in production.")
if not SECRET_KEY:
    SECRET_KEY = "supersecretkey_changeme"

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

app = FastAPI()

frontend_origin_env = os.getenv("FRONTEND_ORIGIN", "").strip()
frontend_origin_regex = os.getenv("FRONTEND_ORIGIN_REGEX", "").strip()
if frontend_origin_env:
    allowed_origins = [origin.strip().rstrip("/") for origin in frontend_origin_env.split(",") if origin.strip()]
elif APP_ENV == "production":
    raise RuntimeError("FRONTEND_ORIGIN must be set in production (comma-separated origins).")
else:
    allowed_origins = ["*"]

# Helpful default for Vercel monorepo/student deployments where preview URLs vary by commit.
if APP_ENV == "production" and not frontend_origin_regex:
    frontend_origin_regex = r"https://.*\.vercel\.app"

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=frontend_origin_regex or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory rate limit store: {bucket: {key: {"hits": deque[timestamp], "blocked_until": datetime|None}}}
RATE_LIMIT_STORE = defaultdict(dict)
PASSWORD_POLICY_MESSAGE = (
    "Password must be at least 8 characters and include uppercase, lowercase, number, and special character."
)

QUESTION_PACKS = {
    "General": {
        "easy": [
            "Tell me about yourself in 60 seconds.",
            "Why do you want this role?",
            "Describe one strength you are proud of.",
        ],
        "medium": [
            "Tell me about a time you faced a major challenge at work or in a project.",
            "Describe a situation where you had to work under pressure.",
            "Tell me about a time you had to manage multiple tasks or priorities at once.",
        ],
        "hard": [
            "Describe a situation where you had to make a difficult decision with limited information.",
            "Tell me about a time you failed and what you learned from it.",
            "Describe a time when you had to convince someone to see things your way.",
        ],
    },
    "SDE": {
        "easy": [
            "Explain a project where you implemented a data structure from scratch.",
            "How do you debug a production issue with limited logs?",
            "Describe a time you improved code readability.",
        ],
        "medium": [
            "Design a scalable URL shortener and explain tradeoffs.",
            "Tell me about a performance bottleneck you identified and fixed.",
            "Describe a time you handled conflicting technical opinions.",
        ],
        "hard": [
            "Design a real-time chat system with fault tolerance.",
            "Tell me about a time your architecture decision failed and what you changed.",
            "How would you migrate a monolith to microservices without downtime?",
        ],
    },
    "HR": {
        "easy": [
            "Why should we hire you?",
            "What are your top 2 career values?",
            "Describe your ideal work environment.",
        ],
        "medium": [
            "Tell me about a conflict with a teammate and how you resolved it.",
            "How do you handle critical feedback?",
            "Describe a time you showed leadership without authority.",
        ],
        "hard": [
            "Tell me about a time you had to make an unpopular decision.",
            "Describe your biggest professional failure and recovery plan.",
            "How do you rebuild trust after missing a key deadline?",
        ],
    },
    "PM": {
        "easy": [
            "How do you prioritize features when all stakeholders say their request is urgent?",
            "Describe a product you admire and one improvement you would make.",
            "How do you define product success for a new feature?",
        ],
        "medium": [
            "Tell me about a product decision you made with incomplete data.",
            "Describe a time engineering and business goals were misaligned.",
            "How would you reduce churn for a struggling product?",
        ],
        "hard": [
            "Design and launch a product in a saturated market with limited budget.",
            "Tell me about a roadmap bet that failed and what you learned.",
            "How do you balance short-term revenue vs long-term user trust?",
        ],
    },
    "Analyst": {
        "easy": [
            "Tell me about a dashboard you built and who used it.",
            "How do you validate data quality before analysis?",
            "Describe one insight you found from messy data.",
        ],
        "medium": [
            "Tell me about a time your analysis changed a business decision.",
            "How would you design an A/B test for onboarding conversion?",
            "Describe a metric that looked good but was misleading.",
        ],
        "hard": [
            "How would you diagnose a sudden 20% drop in weekly active users?",
            "Explain a time your recommendation was challenged and how you defended it.",
            "How do you quantify uncertainty in executive reporting?",
        ],
    },
}


def now_utc():
    return datetime.now(timezone.utc)


def is_rate_limited(bucket: str, key: str, max_attempts: int, window_seconds: int, lock_seconds: int):
    store = RATE_LIMIT_STORE[bucket].setdefault(key, {"hits": deque(), "blocked_until": None})
    blocked_until = store["blocked_until"]
    current = now_utc()

    if blocked_until and current < blocked_until:
        retry_after = int((blocked_until - current).total_seconds())
        return True, max(1, retry_after)

    while store["hits"] and (current - store["hits"][0]).total_seconds() > window_seconds:
        store["hits"].popleft()

    if len(store["hits"]) >= max_attempts:
        store["blocked_until"] = current + timedelta(seconds=lock_seconds)
        store["hits"].clear()
        return True, lock_seconds

    store["hits"].append(current)
    return False, 0


def client_key(request: Request, identity_hint: str = ""):
    ip = (request.client.host if request.client else "unknown").strip()
    hint = identity_hint.strip().lower()
    return f"{ip}:{hint}" if hint else ip


def normalize_role(role: str):
    if not role:
        return "General"
    lower = role.strip().lower()
    role_map = {k.lower(): k for k in QUESTION_PACKS.keys()}
    return role_map.get(lower, "General")


def normalize_difficulty(difficulty: str):
    value = (difficulty or "").strip().lower()
    if value in {"easy", "medium", "hard"}:
        return value
    return "medium"


def clamp_score(value: int, low: int, high: int):
    return max(low, min(high, value))


def score_to_grade(total_score: int):
    # Project-friendly grade bands (requested: 25 should map to D, not C/F).
    if total_score >= 85:
        return "A"
    if total_score >= 70:
        return "B"
    if total_score >= 55:
        return "C"
    if total_score >= 25:
        return "D"
    return "F"


def is_behavioral_question(question: str):
    q = (question or "").strip().lower()
    triggers = [
        "tell me about a time",
        "describe a time",
        "describe a situation",
        "situation where",
        "when you had to",
    ]
    return any(t in q for t in triggers)


def sanitize_transcript_for_eval(transcript: str):
    text = " ".join((transcript or "").split()).strip()
    if not text:
        return ""
    parts = [p.strip() for p in re.split(r"(?<=[.!?])\s+", text) if p.strip()]
    deduped = []
    for sentence in parts:
        norm = re.sub(r"[^a-z0-9 ]", "", sentence.lower()).strip()
        if not norm:
            continue
        duplicate = False
        for prev in deduped[-3:]:
            prev_norm = re.sub(r"[^a-z0-9 ]", "", prev.lower()).strip()
            if prev_norm and SequenceMatcher(None, prev_norm, norm).ratio() >= 0.92:
                duplicate = True
                break
        if not duplicate:
            deduped.append(sentence)
    cleaned = " ".join(deduped).strip()
    return cleaned or text


def heuristic_quality_score(question: str, transcript: str):
    text = (transcript or "").strip()
    if not text:
        return 0
    words = [w for w in re.findall(r"[A-Za-z']+", text)]
    word_count = len(words)
    if word_count < 8:
        return 8

    # Length quality
    if word_count < 25:
        length_score = 12
    elif word_count < 50:
        length_score = 22
    elif word_count < 90:
        length_score = 30
    elif word_count <= 150:
        length_score = 34
    else:
        length_score = 26

    # Sentence quality
    sentences = [s for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    sentence_score = clamp_score(len(sentences) * 4, 8, 20)

    # Relevance to question
    stopwords = {
        "the", "a", "an", "and", "or", "to", "of", "in", "for", "this", "that", "do", "you", "your",
        "is", "are", "it", "on", "with", "why", "what", "how", "role", "want", "we", "our",
    }
    q_tokens = [t for t in re.findall(r"[a-z]+", (question or "").lower()) if t not in stopwords and len(t) > 2]
    q_tokens = list(dict.fromkeys(q_tokens))
    t_tokens = set(re.findall(r"[a-z]+", text.lower()))
    overlap = sum(1 for t in q_tokens if t in t_tokens)
    relevance_score = clamp_score(overlap * 5, 8, 20) if q_tokens else 14

    # Clarity / repetition
    unique_ratio = len(set(w.lower() for w in words)) / max(1, word_count)
    clarity_score = clamp_score(int(round(unique_ratio * 25)), 8, 16)

    total = length_score + sentence_score + relevance_score + clarity_score
    return clamp_score(total, 0, 100)


def generate_otp_code():
    return "".join(random.choice(string.digits) for _ in range(6))


def validate_new_password(password: str):
    value = password or ""
    if len(value) < 8:
        raise HTTPException(status_code=400, detail=PASSWORD_POLICY_MESSAGE)
    if not re.search(r"[A-Z]", value):
        raise HTTPException(status_code=400, detail=PASSWORD_POLICY_MESSAGE)
    if not re.search(r"[a-z]", value):
        raise HTTPException(status_code=400, detail=PASSWORD_POLICY_MESSAGE)
    if not re.search(r"\d", value):
        raise HTTPException(status_code=400, detail=PASSWORD_POLICY_MESSAGE)
    if not re.search(r"[^A-Za-z0-9]", value):
        raise HTTPException(status_code=400, detail=PASSWORD_POLICY_MESSAGE)


def send_reset_otp_email(recipient_email: str, otp: str):
    body_lines = [
        "Hi,",
        "",
        f"Your MockMentor AI password reset OTP is: {otp}",
        "It is valid for 10 minutes.",
        "",
        "If you did not request this, you can ignore this email.",
        "",
        "Regards,",
        "MockMentor AI",
    ]
    email_text = "\n".join(body_lines)

    # Preferred path: Brevo API (works without custom domain; verify sender email once).
    if BREVO_API_KEY and BREVO_FROM_EMAIL:
        payload = json.dumps(
            {
                "sender": {"email": BREVO_FROM_EMAIL, "name": "MockMentor AI"},
                "to": [{"email": recipient_email}],
                "subject": "MockMentor AI - Password Reset OTP",
                "textContent": email_text,
            }
        ).encode("utf-8")
        req = urllib_request.Request(
            "https://api.brevo.com/v3/smtp/email",
            data=payload,
            headers={
                "api-key": BREVO_API_KEY,
                "Content-Type": "application/json",
                "accept": "application/json",
            },
            method="POST",
        )
        try:
            with urllib_request.urlopen(req, timeout=20) as resp:
                if 200 <= resp.status < 300:
                    return True, ""
                return False, f"Brevo returned status {resp.status}"
        except urllib_error.HTTPError as e:
            err_body = ""
            try:
                err_body = e.read().decode("utf-8", errors="ignore")
            except Exception:
                pass
            return False, f"Brevo HTTPError {e.code}: {err_body or e.reason}"
        except Exception as e:
            return False, f"Brevo error: {e}"

    # Preferred path: Resend HTTP API (no SMTP setup needed).
    if RESEND_API_KEY and OTP_FROM_EMAIL:
        payload = json.dumps(
            {
                "from": OTP_FROM_EMAIL,
                "to": [recipient_email],
                "subject": "MockMentor AI - Password Reset OTP",
                "text": email_text,
            }
        ).encode("utf-8")
        req = urllib_request.Request(
            "https://api.resend.com/emails",
            data=payload,
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib_request.urlopen(req, timeout=20) as resp:
                if 200 <= resp.status < 300:
                    return True, ""
                return False, f"Resend returned status {resp.status}"
        except urllib_error.HTTPError as e:
            err_body = ""
            try:
                err_body = e.read().decode("utf-8", errors="ignore")
            except Exception:
                pass
            return False, f"Resend HTTPError {e.code}: {err_body or e.reason}"
        except Exception as e:
            return False, f"Resend error: {e}"

    # Fallback path: SMTP.
    if not SMTP_HOST or not SMTP_USER or not SMTP_PASS or not SMTP_FROM:
        return False, "Neither Resend API nor SMTP is configured"

    msg = EmailMessage()
    msg["Subject"] = "MockMentor AI - Password Reset OTP"
    msg["From"] = SMTP_FROM
    msg["To"] = recipient_email
    msg.set_content(email_text)

    context = ssl.create_default_context()
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as server:
        server.starttls(context=context)
        server.login(SMTP_USER, SMTP_PASS)
        server.send_message(msg)
    return True, ""


class UserRegister(BaseModel):
    name: str
    email: str
    password: str
    security_question: str
    security_answer: str


class UserUpdate(BaseModel):
    name: str = None
    current_password: str = None
    new_password: str = None


class Token(BaseModel):
    access_token: str
    token_type: str


def init_db():
    with sqlite3.connect("sessions.db") as conn:
        c = conn.cursor()

        c.execute("PRAGMA table_info(sessions)")
        columns = [row[1] for row in c.fetchall()]
        if columns and "user_id" not in columns:
            c.execute("ALTER TABLE sessions ADD COLUMN user_id INTEGER DEFAULT 0")
            conn.commit()

        c.execute("PRAGMA table_info(users)")
        user_columns = [row[1] for row in c.fetchall()]
        if user_columns and "security_question" not in user_columns:
            c.execute("ALTER TABLE users ADD COLUMN security_question TEXT")
            c.execute("ALTER TABLE users ADD COLUMN security_answer TEXT")
            conn.commit()
        if user_columns and "otp_code" not in user_columns:
            c.execute("ALTER TABLE users ADD COLUMN otp_code TEXT")
            c.execute("ALTER TABLE users ADD COLUMN otp_expiry TEXT")
            conn.commit()

        c.execute(
            """CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            security_question TEXT,
            security_answer TEXT,
            otp_code TEXT,
            otp_expiry TEXT
        )"""
        )
        c.execute(
            """CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT,
            score INTEGER,
            grade TEXT,
            eye_contact REAL,
            wpm REAL,
            filler_count INTEGER,
            question TEXT,
            transcript TEXT,
            overall_feedback TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )"""
        )
        conn.commit()


init_db()


def hash_password(password: str):
    return pwd_context.hash(password)


def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)


def create_token(data: dict):
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({**data, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_today_utc_date():
    return datetime.now(timezone.utc).date()


def parse_session_date(raw_date: str):
    if not raw_date:
        return None

    try:
        return datetime.strptime(raw_date, "%Y-%m-%d").date()
    except ValueError:
        pass

    try:
        parsed = datetime.strptime(raw_date, "%b %d").date()
        today = get_today_utc_date()
        candidate = parsed.replace(year=today.year)
        if candidate > today:
            candidate = candidate.replace(year=today.year - 1)
        return candidate
    except ValueError:
        return None


@app.post("/register")
async def register(user: UserRegister):
    validate_new_password(user.password)
    with sqlite3.connect("sessions.db") as conn:
        c = conn.cursor()
        c.execute("SELECT id FROM users WHERE email = ?", (user.email,))
        if c.fetchone():
            raise HTTPException(status_code=400, detail="Email already registered")
        c.execute(
            "INSERT INTO users (name, email, password, security_question, security_answer) VALUES (?, ?, ?, ?, ?)",
            (
                user.name,
                user.email,
                hash_password(user.password),
                user.security_question,
                user.security_answer.lower().strip(),
            ),
        )
        conn.commit()
    return {"message": "Registration successful"}


@app.post("/forgot-password")
async def forgot_password(data: dict, request: Request):
    email = data.get("email", "").strip().lower()
    answer = data.get("security_answer", "").lower().strip()
    new_password = data.get("new_password", "")
    if not email or not answer or not new_password:
        raise HTTPException(status_code=400, detail="Email, security answer and new password are required")
    validate_new_password(new_password)

    limited, retry_after = is_rate_limited(
        bucket="legacy_reset",
        key=client_key(request, email),
        max_attempts=5,
        window_seconds=600,
        lock_seconds=900,
    )
    if limited:
        raise HTTPException(status_code=429, detail=f"Too many reset attempts. Try again in {retry_after}s.")
    with sqlite3.connect("sessions.db") as conn:
        c = conn.cursor()
        c.execute("SELECT id, security_answer FROM users WHERE email = ?", (email,))
        row = c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Email not found")
        saved_answer = (row[1] or "").lower().strip()
        if saved_answer != answer:
            raise HTTPException(status_code=400, detail="Incorrect security answer")
        c.execute("UPDATE users SET password = ? WHERE id = ?", (hash_password(new_password), row[0]))
        conn.commit()
    return {"message": "Password reset successful"}


@app.post("/forgot-password/request-otp")
async def request_reset_otp(data: dict, request: Request):
    email = data.get("email", "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    limited, retry_after = is_rate_limited(
        bucket="otp_request",
        key=client_key(request, email),
        max_attempts=4,
        window_seconds=600,
        lock_seconds=900,
    )
    if limited:
        raise HTTPException(status_code=429, detail=f"Too many OTP requests. Try again in {retry_after}s.")

    with sqlite3.connect("sessions.db") as conn:
        c = conn.cursor()
        c.execute("SELECT id FROM users WHERE email = ?", (email,))
        user = c.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="Email not found")

        otp = generate_otp_code()
        expiry = (now_utc() + timedelta(minutes=10)).isoformat()
        c.execute("UPDATE users SET otp_code = ?, otp_expiry = ? WHERE id = ?", (otp, expiry, user[0]))
        conn.commit()

    sent = False
    send_error = ""
    try:
        sent, send_error = send_reset_otp_email(email, otp)
    except Exception as e:
        send_error = str(e)
    if not sent:
        print(f"[OTP] Email send failed for {email}: {send_error}")
        print(f"[OTP] Dev fallback OTP for {email}: {otp}")

    if not sent:
        raise HTTPException(status_code=500, detail="Failed to send OTP email. Please try again.")

    return {
        "message": "OTP sent successfully. Check your email.",
        "expires_in_minutes": 10,
        "email_sent": True,
    }


@app.post("/forgot-password/verify-otp")
async def verify_reset_otp(data: dict, request: Request):
    email = data.get("email", "").strip().lower()
    otp = data.get("otp", "").strip()
    new_password = data.get("new_password", "")
    if not email or not otp or not new_password:
        raise HTTPException(status_code=400, detail="Email, OTP and new password are required")
    validate_new_password(new_password)

    limited, retry_after = is_rate_limited(
        bucket="otp_verify",
        key=client_key(request, email),
        max_attempts=8,
        window_seconds=600,
        lock_seconds=900,
    )
    if limited:
        raise HTTPException(status_code=429, detail=f"Too many attempts. Try again in {retry_after}s.")

    with sqlite3.connect("sessions.db") as conn:
        c = conn.cursor()
        c.execute("SELECT id, otp_code, otp_expiry FROM users WHERE email = ?", (email,))
        row = c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Email not found")

        stored_otp = (row[1] or "").strip()
        expiry_raw = row[2]
        if not stored_otp or not expiry_raw:
            raise HTTPException(status_code=400, detail="OTP not requested. Please request OTP first.")

        try:
            expiry = datetime.fromisoformat(expiry_raw)
        except ValueError:
            expiry = now_utc() - timedelta(seconds=1)
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)

        if now_utc() > expiry:
            raise HTTPException(status_code=400, detail="OTP expired. Please request a new one.")
        if otp != stored_otp:
            raise HTTPException(status_code=400, detail="Invalid OTP")

        c.execute(
            "UPDATE users SET password = ?, otp_code = NULL, otp_expiry = NULL WHERE id = ?",
            (hash_password(new_password), row[0]),
        )
        conn.commit()
    return {"message": "Password reset successful"}


@app.get("/security-question")
async def get_security_question(email: str):
    normalized_email = (email or "").strip().lower()
    if not normalized_email:
        raise HTTPException(status_code=400, detail="Email is required")

    with sqlite3.connect("sessions.db") as conn:
        c = conn.cursor()
        c.execute("SELECT security_question FROM users WHERE email = ?", (normalized_email,))
        row = c.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Email not found")
    return {"security_question": row[0]}


@app.post("/login", response_model=Token)
async def login(request: Request, form: OAuth2PasswordRequestForm = Depends()):
    email = (form.username or "").strip().lower()
    limited, retry_after = is_rate_limited(
        bucket="login",
        key=client_key(request, email),
        max_attempts=8,
        window_seconds=600,
        lock_seconds=900,
    )
    if limited:
        raise HTTPException(status_code=429, detail=f"Too many login attempts. Try again in {retry_after}s.")

    with sqlite3.connect("sessions.db") as conn:
        c = conn.cursor()
        c.execute("SELECT id, name, password FROM users WHERE email = ?", (email,))
        row = c.fetchone()
    if not row or not verify_password(form.password, row[2]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token({"user_id": row[0], "name": row[1]})
    return {"access_token": token, "token_type": "bearer"}


@app.get("/me")
async def get_me(user_id: int = Depends(get_current_user)):
    with sqlite3.connect("sessions.db") as conn:
        c = conn.cursor()
        c.execute("SELECT id, name, email FROM users WHERE id = ?", (user_id,))
        row = c.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": row[0], "name": row[1], "email": row[2]}


@app.get("/profile")
async def get_profile(user_id: int = Depends(get_current_user)):
    with sqlite3.connect("sessions.db") as conn:
        c = conn.cursor()
        c.execute("SELECT id, name, email FROM users WHERE id = ?", (user_id,))
        user = c.fetchone()
        c.execute("SELECT COUNT(*), AVG(score), MAX(score), MIN(score) FROM sessions WHERE user_id = ?", (user_id,))
        stats = c.fetchone()
        c.execute("SELECT grade, COUNT(*) FROM sessions WHERE user_id = ? GROUP BY grade", (user_id,))
        grades = dict(c.fetchall())
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": user[0],
        "name": user[1],
        "email": user[2],
        "total_sessions": stats[0] or 0,
        "avg_score": round(stats[1], 1) if stats[1] else 0,
        "best_score": stats[2] or 0,
        "worst_score": stats[3] or 0,
        "grades": grades,
    }


@app.put("/profile/update")
async def update_profile(data: UserUpdate, user_id: int = Depends(get_current_user)):
    with sqlite3.connect("sessions.db") as conn:
        c = conn.cursor()
        c.execute("SELECT password FROM users WHERE id = ?", (user_id,))
        row = c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        if data.name:
            c.execute("UPDATE users SET name = ? WHERE id = ?", (data.name, user_id))
        if data.new_password:
            if not data.current_password or not verify_password(data.current_password, row[0]):
                raise HTTPException(status_code=400, detail="Current password is incorrect")
            validate_new_password(data.new_password)
            c.execute("UPDATE users SET password = ? WHERE id = ?", (hash_password(data.new_password), user_id))
        conn.commit()
    return {"message": "Profile updated successfully"}


@app.get("/")
async def root():
    return {"message": "Backend Running!"}


@app.get("/question")
async def get_question(role: str = "General", difficulty: str = "medium", user_id: int = Depends(get_current_user)):
    selected_role = normalize_role(role)
    selected_difficulty = normalize_difficulty(difficulty)

    # Dynamic progression: easy -> medium -> hard based on total sessions.
    if difficulty.strip().lower() == "auto":
        with sqlite3.connect("sessions.db") as conn:
            c = conn.cursor()
            c.execute("SELECT COUNT(*) FROM sessions WHERE user_id = ?", (user_id,))
            total_sessions = c.fetchone()[0] or 0
        if total_sessions < 5:
            selected_difficulty = "easy"
        elif total_sessions < 15:
            selected_difficulty = "medium"
        else:
            selected_difficulty = "hard"

    pool = QUESTION_PACKS.get(selected_role, QUESTION_PACKS["General"]).get(selected_difficulty, [])
    if not pool:
        pool = INTERVIEW_QUESTIONS

    return {
        "question": random.choice(pool),
        "role": selected_role,
        "difficulty": selected_difficulty,
    }


@app.get("/streak")
async def get_streak(user_id: int = Depends(get_current_user)):
    with sqlite3.connect("sessions.db") as conn:
        c = conn.cursor()
        c.execute("SELECT DISTINCT date FROM sessions WHERE user_id = ? ORDER BY id DESC", (user_id,))
        dates = [row[0] for row in c.fetchall()]

    parsed_dates = {d for d in (parse_session_date(raw) for raw in dates) if d}
    if not parsed_dates:
        return {"streak": 0, "best_streak": 0}

    today = get_today_utc_date()

    streak = 0
    check = today
    while check in parsed_dates:
        streak += 1
        check = check - timedelta(days=1)

    best = 0
    cur = 0
    prev = None
    for d in sorted(parsed_dates):
        if prev and (d - prev).days == 1:
            cur += 1
        else:
            cur = 1
        best = max(best, cur)
        prev = d

    return {"streak": streak, "best_streak": best}


@app.get("/sessions/{session_id}")
async def get_session_detail(session_id: int, user_id: int = Depends(get_current_user)):
    with sqlite3.connect("sessions.db") as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM sessions WHERE id = ? AND user_id = ?", (session_id, user_id))
        row = c.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "id": row[0],
        "user_id": row[1],
        "date": row[2],
        "score": row[3],
        "grade": row[4],
        "eye_contact": row[5],
        "wpm": row[6],
        "filler_count": row[7],
        "question": row[8],
        "transcript": row[9],
        "overall_feedback": row[10],
    }


@app.get("/sessions")
async def get_sessions(limit: int = 10, user_id: int = Depends(get_current_user)):
    safe_limit = max(1, min(limit, 200))
    with sqlite3.connect("sessions.db") as conn:
        c = conn.cursor()
        c.execute(
            "SELECT id, date, score, grade, eye_contact, wpm, filler_count FROM sessions WHERE user_id = ? ORDER BY id DESC LIMIT ?",
            (user_id, safe_limit),
        )
        rows = c.fetchall()
    return {
        "sessions": [
            {
                "id": r[0],
                "date": r[1],
                "score": r[2],
                "grade": r[3],
                "eye": r[4],
                "wpm": r[5],
                "filler_count": r[6],
            }
            for r in rows
        ]
    }


@app.get("/analytics")
async def get_analytics(user_id: int = Depends(get_current_user)):
    with sqlite3.connect("sessions.db") as conn:
        c = conn.cursor()
        c.execute(
            "SELECT date, score, wpm FROM sessions WHERE user_id = ? ORDER BY id ASC",
            (user_id,),
        )
        rows = c.fetchall()

    points = []
    for date_raw, score_raw, wpm_raw in rows:
        parsed = parse_session_date(date_raw)
        if not parsed:
            continue
        points.append(
            {
                "date": parsed.isoformat(),
                "score": float(score_raw or 0),
                "wpm": float(wpm_raw or 0),
            }
        )

    if not points:
        return {
            "total_sessions": 0,
            "weekly_average": 0,
            "trend_slope": 0,
            "consistency_score": 0,
            "series": [],
        }

    last_7_days = now_utc().date() - timedelta(days=6)
    weekly = [p["score"] for p in points if datetime.strptime(p["date"], "%Y-%m-%d").date() >= last_7_days]
    weekly_avg = round(sum(weekly) / len(weekly), 2) if weekly else 0

    n = len(points)
    xs = list(range(n))
    ys = [p["score"] for p in points]
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    denominator = sum((x - mean_x) ** 2 for x in xs) or 1
    trend_slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / denominator

    variance = sum((y - mean_y) ** 2 for y in ys) / n
    std_dev = variance ** 0.5
    consistency = max(0, min(100, round(100 - std_dev * 2.5, 2)))

    return {
        "total_sessions": n,
        "weekly_average": weekly_avg,
        "trend_slope": round(trend_slope, 3),
        "consistency_score": consistency,
        "series": points[-60:],
    }


@app.delete("/sessions/reset")
async def reset_sessions(user_id: int = Depends(get_current_user)):
    with sqlite3.connect("sessions.db") as conn:
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        conn.commit()
    return {"message": "Sessions cleared"}


@app.post("/evaluate")
async def evaluate_answer(data: dict, user_id: int = Depends(get_current_user)):
    question = data.get("question", "")
    transcript = data.get("transcript", "")
    cleaned_transcript = sanitize_transcript_for_eval(transcript)
    eye_contact = data.get("eye_contact", 0)
    filler_count = data.get("filler_count", 0)
    wpm = data.get("wpm", 0)

    if not cleaned_transcript or len(cleaned_transcript.strip()) < 10:
        return {
            "error": "No answer detected",
            "overall_feedback": "No answer was provided. Please speak clearly into the microphone.",
        }

    try:
        repeat_warning = ""
        with sqlite3.connect("sessions.db") as conn:
            c = conn.cursor()
            c.execute(
                "SELECT transcript, question FROM sessions WHERE user_id = ? ORDER BY id DESC LIMIT 8",
                (user_id,),
            )
            past_rows = c.fetchall()

        normalized_current = " ".join(cleaned_transcript.lower().split())
        best_similarity = 0.0
        for old_transcript, old_question in past_rows:
            previous = " ".join((old_transcript or "").lower().split())
            if not previous:
                continue
            similarity = SequenceMatcher(None, normalized_current, previous).ratio()
            if old_question == question:
                similarity += 0.08
            best_similarity = max(best_similarity, min(similarity, 1.0))

        if best_similarity >= 0.82:
            repeat_warning = (
                "Your answer pattern is very similar to recent sessions. "
                "Try a fresh example with different context, action depth, and measurable impact."
            )

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Question: {question}\n\nAnswer: {cleaned_transcript}"},
            ],
            temperature=0.3,
        )
        raw = response.choices[0].message.content.strip()
        try:
            result = json.loads(raw)
        except Exception:
            result = {"overall_feedback": raw, "total_score": 50, "grade": "B"}

        # Normalize model scores to stable numeric bounds.
        section_keys = ["situation_score", "task_score", "action_score", "result_score"]
        section_scores = []
        for key in section_keys:
            try:
                section_scores.append(clamp_score(int(round(float(result.get(key, 0)))), 0, 25))
            except Exception:
                section_scores.append(0)

        if sum(section_scores) == 0:
            # Fallback when model returns text-only or malformed JSON.
            fallback_total = clamp_score(int(round(float(result.get("total_score", 50)))), 0, 100)
            base = fallback_total // 4
            remainder = fallback_total - base * 4
            section_scores = [base, base, base, base]
            for i in range(remainder):
                section_scores[i] += 1
            section_scores = [clamp_score(v, 0, 25) for v in section_scores]

        total_score = clamp_score(sum(section_scores), 0, 100)

        # Calibration: STAR-only harshness can underrate non-behavioral questions
        # (e.g., "Why do you want this role?") even when answer quality is decent.
        word_count = len((transcript or "").split())
        if not is_behavioral_question(question) and word_count >= 55 and total_score < 60:
            target = 60
            scale = target / max(1, total_score)
            boosted = [clamp_score(int(round(v * scale)), 0, 25) for v in section_scores]
            # Keep exact target sum where possible.
            cur = sum(boosted)
            idx = 0
            while cur < target and idx < 20:
                j = idx % 4
                if boosted[j] < 25:
                    boosted[j] += 1
                    cur += 1
                idx += 1
            section_scores = boosted
            total_score = clamp_score(sum(section_scores), 0, 100)

        result["situation_score"] = section_scores[0]
        result["task_score"] = section_scores[1]
        result["action_score"] = section_scores[2]
        result["result_score"] = section_scores[3]

        # Blend model score with deterministic quality signal for stable grading.
        heuristic_score = heuristic_quality_score(question, cleaned_transcript)
        blended_score = clamp_score(int(round(total_score * 0.72 + heuristic_score * 0.28)), 0, 100)
        if not is_behavioral_question(question) and heuristic_score >= 65 and blended_score < 65:
            blended_score = 65

        result["total_score"] = blended_score
        result["grade"] = score_to_grade(blended_score)

        result["eye_contact"] = round(eye_contact, 1)
        result["filler_count"] = filler_count
        result["wpm"] = round(wpm, 1)

        if eye_contact < 50:
            result["overall_feedback"] += " Your eye contact was low - try to look at the camera more."
        if filler_count > 5:
            result["overall_feedback"] += f" You used {filler_count} filler words - practice pausing instead."
        if repeat_warning:
            result["overall_feedback"] += f" {repeat_warning}"
            result["repeat_answer_warning"] = repeat_warning
            result["repeat_similarity"] = round(best_similarity, 2)

        with sqlite3.connect("sessions.db") as conn:
            conn.execute(
                "INSERT INTO sessions (user_id, date, score, grade, eye_contact, wpm, filler_count, question, transcript, overall_feedback) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (
                    user_id,
                    datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                    result.get("total_score", 0),
                    result.get("grade", "B"),
                    eye_contact,
                    wpm,
                    filler_count,
                    question,
                    cleaned_transcript,
                    result.get("overall_feedback", ""),
                ),
            )
            conn.commit()
        return result
    except Exception as e:
        print("Evaluation Error:", e)
        return {"error": str(e), "overall_feedback": "Evaluation failed. Please try again."}


@app.post("/followup")
async def get_followup(data: dict, user_id: int = Depends(get_current_user)):
    question = data.get("question", "")
    transcript = data.get("transcript", "")
    round_no = int(data.get("round", 1) or 1)
    requested_difficulty = normalize_difficulty(data.get("difficulty", "medium"))

    if round_no >= 3:
        effective_difficulty = "hard"
    elif round_no == 2:
        effective_difficulty = "medium" if requested_difficulty == "easy" else requested_difficulty
    else:
        effective_difficulty = requested_difficulty

    style_map = {
        "easy": "Keep it clear and friendly. Probe fundamentals only.",
        "medium": "Probe decision-making and measurable outcomes.",
        "hard": "Probe trade-offs, risks, edge cases, and accountability deeply.",
    }

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a professional interviewer. Ask ONE follow-up question only. "
                        f"Round: {round_no}. Difficulty: {effective_difficulty}. "
                        f"{style_map[effective_difficulty]} Return ONLY the question."
                    ),
                },
                {"role": "user", "content": f"Original Question: {question}\n\nCandidate's Answer: {transcript}"},
            ],
            temperature=0.5,
        )
        return {"followup": response.choices[0].message.content.strip(), "round": round_no, "difficulty": effective_difficulty}
    except Exception:
        return {
            "followup": "Can you elaborate more on the outcome and what you learned from it?",
            "round": round_no,
            "difficulty": effective_difficulty,
        }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    import asyncio
    import uuid

    await websocket.accept()
    session_id = uuid.uuid4().hex[:8]
    print(f"[WS] Connected: {session_id}")
    last_sent_transcript = ""

    def extract_incremental_text(previous_text: str, current_text: str):
        prev = (previous_text or "").strip()
        cur = (current_text or "").strip()
        if not cur:
            return "", prev
        if not prev:
            return cur, cur

        prev_words = prev.split()
        cur_words = cur.split()
        prev_words_l = [w.lower() for w in prev_words]
        cur_words_l = [w.lower() for w in cur_words]

        # Best case: strict prefix growth.
        max_prefix = min(len(prev_words_l), len(cur_words_l))
        common_prefix = 0
        while common_prefix < max_prefix and prev_words_l[common_prefix] == cur_words_l[common_prefix]:
            common_prefix += 1
        if common_prefix == len(cur_words_l):
            return "", prev
        if common_prefix >= max(4, len(prev_words_l) - 2):
            incremental = " ".join(cur_words[common_prefix:]).strip()
            return incremental, cur

        # Robust fallback: align old transcript to new transcript and emit only tail delta.
        sm = SequenceMatcher(None, prev_words_l, cur_words_l, autojunk=False)
        blocks = sm.get_matching_blocks()

        best_end_in_prev = -1
        tail_start_in_cur = None
        best_size = 0
        for block in blocks:
            if block.size <= 0:
                continue
            end_prev = block.a + block.size
            if end_prev > best_end_in_prev or (end_prev == best_end_in_prev and block.size > best_size):
                best_end_in_prev = end_prev
                tail_start_in_cur = block.b + block.size
                best_size = block.size

        if tail_start_in_cur is None:
            return "", prev
        if tail_start_in_cur >= len(cur_words):
            return "", cur

        incremental_words = cur_words[tail_start_in_cur:]
        incremental = " ".join(incremental_words).strip()
        if not incremental:
            return "", cur
        return incremental, cur

    async def transcribe_and_send(data: bytes, idx: int):
        nonlocal last_sent_transcript
        fname = f"audio_{session_id}_{idx}.webm"
        try:
            with open(fname, "wb") as f:
                f.write(data)

            with open(fname, "rb") as audio_file:
                result = await asyncio.to_thread(
                    client.audio.transcriptions.create,
                    file=(fname, audio_file, "audio/webm"),
                    model="whisper-large-v3",
                    language="en",
                    prompt="Interview answer in English.",
                )

            text = result.text.strip()
            print(f"[WS] [{idx}] {len(data)}b -> {text!r}")
            if text and websocket.client_state.name != "DISCONNECTED":
                incremental, updated = extract_incremental_text(last_sent_transcript, text)
                if incremental:
                    await websocket.send_text(incremental)
                last_sent_transcript = updated
        except Exception as e:
            print(f"[WS] [{idx}] Error: {e}")
        finally:
            try:
                os.remove(fname)
            except Exception:
                pass

    chunk_idx = 0
    try:
        while True:
            data = await websocket.receive_bytes()
            print(f"[WS] Chunk {chunk_idx}: {len(data)} bytes")
            if len(data) < 1000:
                continue
            await transcribe_and_send(data, chunk_idx)
            chunk_idx += 1
    except Exception as e:
        print(f"[WS] Disconnected {session_id}: {e}")


INTERVIEW_QUESTIONS = [
    "Tell me about a time you faced a major challenge at work or in a project.",
    "Describe a situation where you had to work under pressure.",
    "Tell me about a time you showed leadership in a team.",
    "Describe a project where you had to learn something new quickly.",
    "Tell me about a time you had a conflict with a teammate and how you resolved it.",
    "Describe a situation where you had to make a difficult decision with limited information.",
    "Tell me about a time you failed and what you learned from it.",
    "Describe a time when you went above and beyond your job responsibilities.",
    "Tell me about a time you had to manage multiple tasks or priorities at once.",
    "Describe a situation where you had to convince someone to see things your way.",
]


SYSTEM_PROMPT = """You are an expert interview coach evaluating answers using the STAR method.

STAR Method:
- Situation: Did the candidate describe the context clearly?
- Task: Did they explain their specific responsibility?
- Action: Did they describe what THEY did, with specific steps?
- Result: Did they mention the outcome with measurable impact?

Important fairness rules:
- If the question is non-behavioral (example: "Why do you want this role?"), still score fairly for clarity, relevance, specificity, and communication quality.
- Do not over-penalize strong, coherent answers just because they are not strict STAR storytelling.

Evaluate the answer and respond ONLY in this exact JSON format:
{
  "situation_score": <0-25>,
  "task_score": <0-25>,
  "action_score": <0-25>,
  "result_score": <0-25>,
  "total_score": <0-100>,
  "situation_feedback": "<specific feedback>",
  "task_feedback": "<specific feedback>",
  "action_feedback": "<specific feedback>",
  "result_feedback": "<specific feedback>",
  "overall_feedback": "<2-3 sentence summary>",
  "grade": "<A/B/C/D/F>"
}"""
