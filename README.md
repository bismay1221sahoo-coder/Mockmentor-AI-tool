# MockMentor AI

AI-powered interview preparation platform with real-time speech transcription, webcam-based interview signals, and STAR-method evaluation using Groq models.

## What This Project Does
MockMentor AI helps users practice interview answers with:
- live transcription via WebSocket audio streaming
- STAR-based answer scoring
- eye-contact and speaking metrics
- follow-up interview questions
- history, analytics, streaks, and profile tracking

## Key Features
- Authentication and user profile (JWT)
- OTP-based password reset flow
- Role-based question packs: `General`, `SDE`, `HR`, `PM`, `Analyst`
- Dynamic difficulty: `easy`, `medium`, `hard`, and `auto`
- AI follow-up rounds (1 to 3) with increasing depth
- Re-answer mode with score comparison (`previous_score`, `score_delta`)
- Repeat-answer detection and coaching hint
- Real-time face-state tracking:
  - looking away count
  - no-face count
  - multiple-face warnings (auto-stop after 2 warnings)
- Framing guidance (move closer/back, center face)
- Speaking pace zones timeline
- Session analytics dashboard:
  - weekly average
  - trend slope
  - consistency score
- Achievement badges and streak tracking
- Compact mode (mobile-friendly) and Focus mode (distraction-free)

## Tech Stack
- Frontend: React, Recharts, MediaPipe FaceMesh, Framer Motion
- Backend: FastAPI, SQLite, JWT, Passlib, Groq API (LLaMA + Whisper)
- Transport: REST + WebSocket

## Project Structure
```text
interview-chatbot/
  backend/
    main.py
  frontend/
    src/
      App.js
      AuthPage.js
      ProfilePage.js
      HistoryPage.js
```

## Local Setup

### 1. Clone and open project
```bash
git clone <your-repo-url>
cd interview-chatbot
```

### 2. Backend setup
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install fastapi uvicorn python-dotenv passlib[bcrypt] python-jose groq python-multipart
```

Create `backend/.env`:
```env
GROQ_API_KEY=your_groq_api_key
SECRET_KEY=your_long_random_secret
APP_ENV=development
```

Run backend:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Frontend setup
```bash
cd ../frontend
npm install
npm start
```

Frontend runs at `http://localhost:3000` and backend at `http://localhost:8000`.

## Important API Routes
- `POST /register`
- `POST /login`
- `GET /me`
- `GET /question?role=...&difficulty=...`
- `POST /evaluate`
- `POST /followup`
- `GET /sessions`
- `GET /sessions/{session_id}`
- `GET /streak`
- `GET /analytics`
- `POST /forgot-password/request-otp`
- `POST /forgot-password/verify-otp`
- `WS /ws`

## Security Notes
- Use a strong `SECRET_KEY` in production.
- Restrict CORS origins for production deployment.
- OTP in development may be shown in API response for testing; disable this in production.
- Login/reset endpoints include rate limiting.

## Build and Validation
```bash
cd frontend
npm run build
```

```bash
cd ../backend
python -m py_compile main.py
```

## Roadmap Ideas
- Email provider integration for production OTP delivery
- Refresh-token based auth
- Team dashboard / mentor view
- Deeper answer structure diagnostics
