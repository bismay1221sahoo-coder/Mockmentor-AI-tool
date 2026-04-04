from fastapi import FastAPI, WebSocket, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from groq import Groq
import os
from dotenv import load_dotenv
import json
import sqlite3
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
from pydantic import BaseModel

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "supersecretkey_changeme")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Models ----------
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

# ---------- DB ----------
def init_db():
    with sqlite3.connect("sessions.db") as conn:
        c = conn.cursor()
        # migrate old sessions table if user_id column missing
        c.execute("PRAGMA table_info(sessions)")
        columns = [row[1] for row in c.fetchall()]
        if columns and "user_id" not in columns:
            c.execute("ALTER TABLE sessions ADD COLUMN user_id INTEGER DEFAULT 0")
            conn.commit()
        # migrate users table if security columns missing
        c.execute("PRAGMA table_info(users)")
        user_columns = [row[1] for row in c.fetchall()]
        if user_columns and "security_question" not in user_columns:
            c.execute("ALTER TABLE users ADD COLUMN security_question TEXT")
            c.execute("ALTER TABLE users ADD COLUMN security_answer TEXT")
            conn.commit()
        c.execute('''CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            security_question TEXT,
            security_answer TEXT
        )''')
        c.execute('''CREATE TABLE IF NOT EXISTS sessions (
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
        )''')
        conn.commit()

init_db()

# ---------- Auth Helpers ----------
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

# ---------- Auth Endpoints ----------
@app.post("/register")
async def register(user: UserRegister):
    with sqlite3.connect("sessions.db") as conn:
        c = conn.cursor()
        c.execute("SELECT id FROM users WHERE email = ?", (user.email,))
        if c.fetchone():
            raise HTTPException(status_code=400, detail="Email already registered")
        c.execute("INSERT INTO users (name, email, password, security_question, security_answer) VALUES (?, ?, ?, ?, ?)",
                  (user.name, user.email, hash_password(user.password),
                   user.security_question, user.security_answer.lower().strip()))
        conn.commit()
    return {"message": "Registration successful"}

@app.post("/forgot-password")
async def forgot_password(data: dict):
    email = data.get("email", "").strip()
    answer = data.get("security_answer", "").lower().strip()
    new_password = data.get("new_password", "")
    with sqlite3.connect("sessions.db") as conn:
        c = conn.cursor()
        c.execute("SELECT id, security_answer FROM users WHERE email = ?", (email,))
        row = c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Email not found")
        if row[1] != answer:
            raise HTTPException(status_code=400, detail="Incorrect security answer")
        c.execute("UPDATE users SET password = ? WHERE id = ?", (hash_password(new_password), row[0]))
        conn.commit()
    return {"message": "Password reset successful"}

@app.get("/security-question")
async def get_security_question(email: str):
    with sqlite3.connect("sessions.db") as conn:
        c = conn.cursor()
        c.execute("SELECT security_question FROM users WHERE email = ?", (email,))
        row = c.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Email not found")
    return {"security_question": row[0]}

@app.post("/login", response_model=Token)
async def login(form: OAuth2PasswordRequestForm = Depends()):
    with sqlite3.connect("sessions.db") as conn:
        c = conn.cursor()
        c.execute("SELECT id, name, password FROM users WHERE email = ?", (form.username,))
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
        "id": user[0], "name": user[1], "email": user[2],
        "total_sessions": stats[0] or 0,
        "avg_score": round(stats[1], 1) if stats[1] else 0,
        "best_score": stats[2] or 0,
        "worst_score": stats[3] or 0,
        "grades": grades
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
            c.execute("UPDATE users SET password = ? WHERE id = ?", (hash_password(data.new_password), user_id))
        conn.commit()
    return {"message": "Profile updated successfully"}

# ---------- App Endpoints ----------
@app.get("/")
async def root():
    return {"message": "Backend Running!"}

@app.get("/question")
async def get_question():
    import random
    return {"question": random.choice(INTERVIEW_QUESTIONS)}

@app.get("/streak")
async def get_streak(user_id: int = Depends(get_current_user)):
    with sqlite3.connect("sessions.db") as conn:
        c = conn.cursor()
        c.execute("SELECT DISTINCT date FROM sessions WHERE user_id = ? ORDER BY id DESC", (user_id,))
        dates = [row[0] for row in c.fetchall()]
    if not dates:
        return {"streak": 0, "best_streak": 0}
    from datetime import datetime
    today = datetime.now(timezone.utc).strftime("%b %d").lstrip("0") if datetime.now(timezone.utc).day >= 10 else datetime.now(timezone.utc).strftime("%b %d")
    streak = 0
    best = 0
    cur = 0
    seen = set(dates)
    # count current streak from today backwards
    check = datetime.now(timezone.utc)
    for _ in range(365):
        d = check.strftime("%b %d")
        if d in seen:
            streak += 1
            check = check.replace(day=check.day - 1) if check.day > 1 else check
        else:
            break
        try:
            check = check.replace(day=check.day - 1)
        except:
            break
    # best streak
    cur = 0
    for i, d in enumerate(reversed(dates)):
        if i == 0:
            cur = 1
        else:
            cur += 1
        best = max(best, cur)
    return {"streak": streak, "best_streak": best}


async def get_session_detail(session_id: int, user_id: int = Depends(get_current_user)):
    with sqlite3.connect("sessions.db") as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM sessions WHERE id = ? AND user_id = ?", (session_id, user_id))
        row = c.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "id": row[0], "user_id": row[1], "date": row[2], "score": row[3],
        "grade": row[4], "eye_contact": row[5], "wpm": row[6],
        "filler_count": row[7], "question": row[8],
        "transcript": row[9], "overall_feedback": row[10]
    }

@app.get("/sessions")
async def get_sessions(user_id: int = Depends(get_current_user)):
    with sqlite3.connect("sessions.db") as conn:
        c = conn.cursor()
        c.execute("SELECT id, date, score, grade, eye_contact, wpm, filler_count FROM sessions WHERE user_id = ? ORDER BY id DESC LIMIT 10", (user_id,))
        rows = c.fetchall()
    return {"sessions": [
        {"id": r[0], "date": r[1], "score": r[2], "grade": r[3], "eye": r[4], "wpm": r[5], "filler_count": r[6]}
        for r in rows
    ]}

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
    eye_contact = data.get("eye_contact", 0)
    filler_count = data.get("filler_count", 0)
    wpm = data.get("wpm", 0)

    if not transcript or len(transcript.strip()) < 10:
        return {"error": "No answer detected", "overall_feedback": "No answer was provided. Please speak clearly into the microphone."}

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Question: {question}\n\nAnswer: {transcript}"}
            ],
            temperature=0.3,
        )
        raw = response.choices[0].message.content.strip()
        try:
            result = json.loads(raw)
        except:
            result = {"overall_feedback": raw, "total_score": 50, "grade": "B"}

        result["eye_contact"] = round(eye_contact, 1)
        result["filler_count"] = filler_count
        result["wpm"] = round(wpm, 1)

        if eye_contact < 50:
            result["overall_feedback"] += " Your eye contact was low - try to look at the camera more."
        if filler_count > 5:
            result["overall_feedback"] += f" You used {filler_count} filler words - practice pausing instead."

        with sqlite3.connect("sessions.db") as conn:
            conn.execute("INSERT INTO sessions (user_id, date, score, grade, eye_contact, wpm, filler_count, question, transcript, overall_feedback) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (user_id, datetime.now(timezone.utc).strftime("%b %d"), result.get("total_score", 0), result.get("grade", "B"),
                 eye_contact, wpm, filler_count, question, transcript, result.get("overall_feedback", "")))
            conn.commit()
        return result
    except Exception as e:
        print("Evaluation Error:", e)
        return {"error": str(e), "overall_feedback": "Evaluation failed. Please try again."}


async def get_followup(data: dict, user_id: int = Depends(get_current_user)):
    question = data.get("question", "")
    transcript = data.get("transcript", "")
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a professional interviewer. Based on the candidate's answer, ask ONE sharp follow-up question to dig deeper. Return ONLY the question, nothing else."},
                {"role": "user", "content": f"Original Question: {question}\n\nCandidate's Answer: {transcript}"}
            ],
            temperature=0.5,
        )
        return {"followup": response.choices[0].message.content.strip()}
    except Exception as e:
        return {"followup": "Can you elaborate more on the outcome and what you learned from it?"}


async def evaluate_answer(data: dict, user_id: int = Depends(get_current_user)):
    question = data.get("question", "")
    transcript = data.get("transcript", "")
    eye_contact = data.get("eye_contact", 0)
    filler_count = data.get("filler_count", 0)
    wpm = data.get("wpm", 0)

    if not transcript or len(transcript.strip()) < 10:
        return {
            "error": "No answer detected",
            "overall_feedback": "No answer was provided. Please speak clearly into the microphone."
        }

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Question: {question}\n\nAnswer: {transcript}"}
            ],
            temperature=0.3,
        )

        raw = response.choices[0].message.content.strip()

        try:
            result = json.loads(raw)
        except:
            result = {"overall_feedback": raw, "total_score": 50, "grade": "B"}

        result["eye_contact"] = round(eye_contact, 1)
        result["filler_count"] = filler_count
        result["wpm"] = round(wpm, 1)

        if eye_contact < 50:
            result["overall_feedback"] += " Your eye contact was low — try to look at the camera more."
        if filler_count > 5:
            result["overall_feedback"] += f" You used {filler_count} filler words — practice pausing instead."

        with sqlite3.connect("sessions.db") as conn:
            conn.execute("INSERT INTO sessions (user_id, date, score, grade, eye_contact, wpm, filler_count, question, transcript, overall_feedback) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (user_id, datetime.now(timezone.utc).strftime("%b %d"), result.get("total_score", 0), result.get("grade", "B"),
                 eye_contact, wpm, filler_count, question, transcript, result.get("overall_feedback", "")))
            conn.commit()

        return result

    except Exception as e:
        print("Evaluation Error:", e)
        return {"error": str(e), "overall_feedback": "Evaluation failed. Please try again."}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    import uuid
    import asyncio
    await websocket.accept()
    session_id = uuid.uuid4().hex[:8]
    print(f"[WS] Connected: {session_id}")

    async def transcribe_and_send(data: bytes, idx: int):
        fname = f"audio_{session_id}_{idx}.webm"
        try:
            with open(fname, "wb") as f:
                f.write(data)
            with open(fname, "rb") as audio_file:
                result = await asyncio.to_thread(
                    client.audio.transcriptions.create,
                    file=(fname, open(fname, "rb"), "audio/webm"),
                    model="whisper-large-v3",
                    language="en",
                    prompt="Interview answer in English."
                )
            text = result.text.strip()
            print(f"[WS] [{idx}] {len(data)}b -> {text!r}")
            if text and not websocket.client_state.name == "DISCONNECTED":
                await websocket.send_text(text)
        except Exception as e:
            print(f"[WS] [{idx}] Error: {e}")
        finally:
            try:
                os.remove(fname)
            except:
                pass

    chunk_idx = 0
    tasks = []
    try:
        while True:
            data = await websocket.receive_bytes()
            print(f"[WS] Chunk {chunk_idx}: {len(data)} bytes")
            if len(data) < 1000:
                continue
            task = asyncio.create_task(transcribe_and_send(data, chunk_idx))
            tasks.append(task)
            chunk_idx += 1
    except Exception as e:
        print(f"[WS] Disconnected {session_id}: {e}")
    finally:
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

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
    "Describe a situation where you had to convince someone to see things your way."
]

SYSTEM_PROMPT = """You are an expert interview coach evaluating answers using the STAR method.

STAR Method:
- Situation: Did the candidate describe the context clearly?
- Task: Did they explain their specific responsibility?
- Action: Did they describe what THEY did, with specific steps?
- Result: Did they mention the outcome with measurable impact?

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
