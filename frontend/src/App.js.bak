import React, { useRef, useState, useEffect } from "react";
import AuthPage from "./AuthPage";
import ProfilePage from "./ProfilePage";
import HistoryPage from "./HistoryPage";
import { FaceMesh } from "@mediapipe/face_mesh";
import { Camera } from "@mediapipe/camera_utils";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Area, AreaChart } from "recharts";

const globalStyles = `
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(255,80,80,0.7); }
    50% { opacity: 0.5; transform: scale(1.5); box-shadow: 0 0 0 6px rgba(255,80,80,0); }
  }
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(30px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeInScale {
    from { opacity: 0; transform: scale(0.93); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes floatOrb {
    0%, 100% { transform: translateY(0px) scale(1); }
    50% { transform: translateY(-30px) scale(1.05); }
  }
  @keyframes gradientShift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  @keyframes scoreCount {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes glowPulse {
    0%, 100% { box-shadow: 0 0 10px rgba(76,175,80,0.3); }
    50% { box-shadow: 0 0 25px rgba(76,175,80,0.7); }
  }
  .fade-in-up { animation: fadeInUp 0.5s cubic-bezier(0.22,1,0.36,1) forwards; }
  .fade-in-scale { animation: fadeInScale 0.45s cubic-bezier(0.22,1,0.36,1) forwards; }
  .score-card-item { animation: scoreCount 0.5s ease forwards; }
  .glow-green { animation: glowPulse 2s ease infinite; }
  button { transition: transform 0.18s cubic-bezier(0.22,1,0.36,1), box-shadow 0.18s ease, opacity 0.15s ease; }
  button:hover { transform: translateY(-3px) scale(1.02); }
  button:active { transform: translateY(0px) scale(0.98); }
  * { box-sizing: border-box; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 10px; }
`;

function App() {
  const videoRef = useRef(null);
  const wsRef = useRef(null);
  const recorderRef = useRef(null);

  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [recording, setRecording] = useState(false);
  const [text, setText] = useState("");
  const [fullTranscript, setFullTranscript] = useState("");
  const [faceStatus, setFaceStatus] = useState("Detecting...");
  const [eyeScore, setEyeScore] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [fillerCount, setFillerCount] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [question, setQuestion] = useState("");
  const [scorecard, setScorecard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [sessions, setSessions] = useState([]);
  const [darkMode, setDarkMode] = useState(true);

  const t = {
    bg: darkMode
      ? "linear-gradient(135deg, #0a0a18 0%, #12103a 35%, #0d1f3c 65%, #0a1628 100%)"
      : "linear-gradient(135deg, #dfe9f3 0%, #e8d5f5 40%, #d4eaf7 100%)",
    orb1: darkMode ? "rgba(99,60,255,0.18)" : "rgba(99,60,255,0.08)",
    orb2: darkMode ? "rgba(0,200,150,0.12)" : "rgba(0,180,130,0.07)",
    card: darkMode ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.72)",
    cardBorder: darkMode ? "rgba(255,255,255,0.09)" : "rgba(180,180,220,0.35)",
    navBg: darkMode ? "rgba(10,10,24,0.88)" : "rgba(255,255,255,0.88)",
    text: darkMode ? "#eeeeff" : "#12122e",
    subtext: darkMode ? "#8888aa" : "#5555aa",
    feedbackBg: darkMode ? "rgba(0,0,0,0.25)" : "rgba(240,240,255,0.6)",
    rowBorder: darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
    blur: "blur(20px)",
    shadow: darkMode ? "0 8px 40px rgba(0,0,0,0.5)" : "0 8px 32px rgba(80,80,200,0.1)",
  };
  const [timer, setTimer] = useState(0);
  const [selectedDuration, setSelectedDuration] = useState(120);
  const timerRef = useRef(null);
  const chunksRef = useRef([]);
  const intervalRef = useRef(null);
  const stopRecordingRef = useRef(null);
  const eyeScoreRef = useRef(0);
  const totalFramesRef = useRef(0);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const authHeaders = { Authorization: `Bearer ${token}` };

  const handleLogin = (tok, me) => {
    setToken(tok);
    setUser(me);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setToken("");
    setUser(null);
    setSessions([]);
  };

  useEffect(() => {
    if (token && !user) {
      fetch("http://localhost:8000/me", { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data) setUser(data); else handleLogout(); });
    }
  }, [token]);

  const fetchSessions = (tok) => {
    fetch("http://localhost:8000/sessions", { headers: { Authorization: `Bearer ${tok || token}` } })
      .then(res => res.json())
      .then(data => setSessions(data.sessions || []))
      .catch(() => {});
  };

  useEffect(() => {
    if (!token) return;
    fetch("http://localhost:8000/question")
      .then(res => res.json())
      .then(data => setQuestion(data.question));
    fetchSessions(token);
  }, [token]);

  useEffect(() => {
    if (!videoRef.current) return;
    const faceMesh = new FaceMesh({
     locateFile: (file) =>
  `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`,
    });
    faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });
    faceMesh.onResults((results) => {
      if (results.multiFaceLandmarks?.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        const leftEye = landmarks[33];
        const rightEye = landmarks[263];
        const nose = landmarks[1];
        const eyeCenterX = (leftEye.x + rightEye.x) / 2;
        const diff = Math.abs(eyeCenterX - nose.x);
        setTotalFrames((prev) => prev + 1);
        totalFramesRef.current += 1;
        if (diff < 0.02) {
          setEyeScore((prev) => prev + 1);
          eyeScoreRef.current += 1;
          setFaceStatus("Looking at Camera");
        } else {
          setFaceStatus("Looking Away");
        }
      } else {
        setFaceStatus("No Face Detected");
      }
    });
    const camera = new Camera(videoRef.current, {
      onFrame: async () => {
        try { await faceMesh.send({ image: videoRef.current }); } catch {}
      },
      width: 640, height: 480,
    });
    camera.start();
    return () => faceMesh.close();
  }, []);

  useEffect(() => {
    if (!recording || !startTime) return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 60000;
      if (elapsed > 0) {
        const currentWpm = wordCount / elapsed;
        if (currentWpm > 160) showToast("Slow down! You're speaking too fast.");
        if (fillerCount > 5) showToast("Try to avoid filler words like 'um' and 'uh'.");
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [recording, startTime, wordCount, fillerCount]);

  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  });

  useEffect(() => {
    if (recording) {
      setTimer(selectedDuration);
      timerRef.current = setInterval(() => {
        setTimer(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            stopRecordingRef.current();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [recording]);

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    videoRef.current.srcObject = stream;
    const audioStream = new MediaStream(stream.getAudioTracks());
    wsRef.current = new WebSocket("ws://localhost:8000/ws");
    setStartTime(Date.now());
    setWordCount(0);
    setFillerCount(0);
    setFullTranscript("");
    setScorecard(null);
    wsRef.current.onmessage = (event) => {
      const newText = event.data.toLowerCase();
      if (!newText) return;
      setText(newText);
      setFullTranscript(prev => prev + " " + newText);
      const words = newText.split(/\s+/);
      setWordCount(prev => prev + words.length);
      const fillers = ["um", "uh", "like", "you know", "basically"];
      let count = 0;
      fillers.forEach((f) => { if (newText.includes(f)) count++; });
      setFillerCount(prev => prev + count);
    };
    const recorder = new MediaRecorder(audioStream);
    recorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.start(1000);
    intervalRef.current = setInterval(() => {
      if (chunksRef.current.length > 0 && wsRef.current?.readyState === 1) {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        wsRef.current.send(blob);
      }
    }, 4000);
    setRecording(true);
  };

  const stopRecording = async () => {
    recorderRef.current?.stop();
    wsRef.current?.close();
    clearInterval(intervalRef.current);
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
    setRecording(false);
    const eyeContactPct = totalFramesRef.current > 0 ? (eyeScoreRef.current / totalFramesRef.current) * 100 : 0;
    const wpm = startTime ? (wordCount / ((Date.now() - startTime) / 60000)) : 0;
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ question, transcript: fullTranscript, eye_contact: eyeContactPct, filler_count: fillerCount, wpm }),
      });
      const data = await res.json();
      setScorecard(data);
      fetchSessions();
    } catch (e) {
      console.error("Evaluation failed:", e);
    }
    setLoading(false);
  };

  const resetSessions = async () => {
    await fetch("http://localhost:8000/sessions/reset", { method: "DELETE", headers: authHeaders });
    setSessions([]);
  };

  const eyeContactPct = totalFrames > 0 ? ((eyeScore / totalFrames) * 100).toFixed(1) : 0;
  const wpm = startTime ? (wordCount / ((Date.now() - startTime) / 60000)).toFixed(1) : 0;

  const radarData = scorecard ? [
    { subject: "Situation", score: scorecard.situation_score || 0, fullMark: 25 },
    { subject: "Task", score: scorecard.task_score || 0, fullMark: 25 },
    { subject: "Action", score: scorecard.action_score || 0, fullMark: 25 },
    { subject: "Result", score: scorecard.result_score || 0, fullMark: 25 },
    { subject: "Eye Contact", score: Math.round(scorecard.eye_contact / 4) || 0, fullMark: 25 },
    { subject: "Fluency", score: Math.max(0, 25 - scorecard.filler_count * 2) || 0, fullMark: 25 },
  ] : [];

  const trendData = [...sessions].reverse().map(s => ({ date: s.date, score: parseInt(s.score, 10) || 0 }));

  const gradeColor = (g) => {
    if (g === "A") return "#4CAF50";
    if (g === "B") return "#2196F3";
    if (g === "C") return "#FF9800";
    return "#f44336";
  };

  const glass = {
    background: t.card,
    border: `1px solid ${t.cardBorder}`,
    backdropFilter: t.blur,
    WebkitBackdropFilter: t.blur,
    boxShadow: t.shadow,
    borderRadius: 18,
  };

  const gradeGradient = (g) => {
    if (g === "A") return "linear-gradient(135deg,#43e97b,#38f9d7)";
    if (g === "B") return "linear-gradient(135deg,#4facfe,#00f2fe)";
    if (g === "C") return "linear-gradient(135deg,#f7971e,#ffd200)";
    return "linear-gradient(135deg,#f44336,#ff1744)";
  };

  if (!token) return <AuthPage onLogin={handleLogin} darkMode={darkMode} />;
  if (showProfile) return <ProfilePage token={token} onBack={() => setShowProfile(false)} onLogout={handleLogout} darkMode={darkMode} />;
  if (showHistory) return <HistoryPage token={token} onBack={() => setShowHistory(false)} onLogout={handleLogout} darkMode={darkMode} />;

  return (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif", background: t.bg, minHeight: "100vh", color: t.text, transition: "all 0.4s ease", position: "relative", overflow: "hidden" }}>
      <style>{globalStyles}</style>
      {/* Background orbs */}
      <div style={{ position: "fixed", top: "-10%", left: "-5%", width: 500, height: 500, borderRadius: "50%", background: t.orb1, filter: "blur(80px)", animation: "floatOrb 8s ease-in-out infinite", pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "fixed", bottom: "-10%", right: "-5%", width: 400, height: 400, borderRadius: "50%", background: t.orb2, filter: "blur(80px)", animation: "floatOrb 10s ease-in-out infinite reverse", pointerEvents: "none", zIndex: 0 }} />

      {toast && (
        <div style={{ position: "fixed", top: 24, right: 24, background: "linear-gradient(135deg,#FF9800,#ff6f00)", color: "white", padding: "13px 22px", borderRadius: 12, fontWeight: 600, zIndex: 1000, boxShadow: "0 4px 20px rgba(255,152,0,0.4)", fontSize: 14, animation: "fadeInUp 0.3s ease" }}>
          {toast}
        </div>
      )}

      <div style={{ background: t.navBg, backdropFilter: t.blur, WebkitBackdropFilter: t.blur, padding: "14px 32px", borderBottom: `1px solid ${t.cardBorder}`, display: "flex", alignItems: "center", gap: 14, position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 20px rgba(0,0,0,0.15)" }}>
        <div style={{ width: 10, height: 10, background: "#4CAF50", borderRadius: "50%", boxShadow: "0 0 8px #4CAF50" }}></div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px", color: t.text }}>MockMentor AI</h2>
        <span style={{ marginLeft: "auto", fontSize: 12, color: t.subtext, fontWeight: 500, letterSpacing: 0.5 }}>Interview Preparation Platform</span>
        <button onClick={() => setDarkMode(!darkMode)} style={{ marginLeft: 12, background: darkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)", border: `1px solid ${t.cardBorder}`, borderRadius: 20, padding: "6px 16px", cursor: "pointer", fontSize: 13, color: t.text, fontWeight: 500 }}>
          {darkMode ? "☀️ Light" : "🌙 Dark"}
        </button>
        {user && <span style={{ fontSize: 13, color: t.subtext, marginLeft: 8 }}>👤 {user.name}</span>}
        <button onClick={() => setShowProfile(true)} style={{ marginLeft: 8, background: "rgba(76,175,80,0.15)", border: "1px solid rgba(76,175,80,0.4)", borderRadius: 20, padding: "6px 16px", cursor: "pointer", fontSize: 13, color: "#4CAF50", fontWeight: 500 }}>
          Profile
        </button>
        <button onClick={() => setShowHistory(true)} style={{ marginLeft: 8, background: "rgba(79,172,254,0.15)", border: "1px solid rgba(79,172,254,0.4)", borderRadius: 20, padding: "6px 16px", cursor: "pointer", fontSize: 13, color: "#4facfe", fontWeight: 500 }}>
          History
        </button>
        <button onClick={handleLogout} style={{ marginLeft: 8, background: "rgba(244,67,54,0.15)", border: "1px solid rgba(244,67,54,0.4)", borderRadius: 20, padding: "6px 16px", cursor: "pointer", fontSize: 13, color: "#f44336", fontWeight: 500 }}>
          Logout
        </button>
      </div>

      <div style={{ padding: 30, maxWidth: 1100, margin: "0 auto" }}>

        {question && (
          <div className="fade-in-up" style={{ ...glass, padding: "20px 24px", marginBottom: 25, borderLeft: "3px solid #4CAF50" }}>
            <div style={{ fontSize: 11, color: "#4CAF50", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600 }}>🎯 Interview Question</div>
            <div style={{ fontSize: 17, lineHeight: 1.6, color: t.text, fontWeight: 500 }}>{question}</div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 25 }}>
          <div>
            <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#000" }}>
              <video ref={videoRef} autoPlay muted style={{ width: "100%", display: "block" }} />
              <div style={{ position: "absolute", bottom: 10, left: 10, background: faceStatus === "Looking at Camera" ? "rgba(76,175,80,0.85)" : "rgba(244,67,54,0.85)", padding: "5px 12px", borderRadius: 20, fontSize: 13 }}>
                {faceStatus}
              </div>
              {recording && (
                <div style={{ position: "absolute", top: 10, right: 10, display: "flex", alignItems: "center", gap: 6, background: timer < 30 ? "rgba(200,0,0,0.92)" : "rgba(180,0,0,0.82)", padding: "5px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, backdropFilter: "blur(6px)", boxShadow: "0 2px 12px rgba(255,0,0,0.3)" }}>
                  <div style={{ width: 8, height: 8, background: "white", borderRadius: "50%", animation: "pulse 1s infinite" }}></div>
                  REC &nbsp;{formatTime(timer)}
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 15 }}>
              {[
                { label: "Eye Contact", value: `${eyeContactPct}%`, color: "#4CAF50", icon: "👁️" },
                { label: "WPM", value: wpm, color: "#2196F3", icon: "💬" },
                { label: "Filler Words", value: fillerCount, color: "#FF9800", icon: "⚠️" },
                { label: "Words Spoken", value: wordCount, color: "#9C27B0", icon: "📝" },
              ].map((item) => (
                <div key={item.label} style={{ ...glass, padding: "14px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, marginBottom: 4 }}>{item.icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: item.color, letterSpacing: "-0.5px" }}>{item.value}</div>
                  <div style={{ fontSize: 11, color: t.subtext, marginTop: 3, fontWeight: 500 }}>{item.label}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 15 }}>
              {!recording && (
                <div style={{ display: "flex", gap: 8, marginBottom: 10, justifyContent: "center" }}>
                  {[60, 120, 180, 300].map(sec => (
                    <button key={sec} onClick={() => setSelectedDuration(sec)}
                      style={{ padding: "7px 16px", borderRadius: 20, border: `2px solid ${selectedDuration === sec ? "#4CAF50" : t.cardBorder}`, background: selectedDuration === sec ? "linear-gradient(135deg,#4CAF50,#2e7d32)" : "transparent", color: selectedDuration === sec ? "white" : t.subtext, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                      {sec / 60 < 1 ? "1" : sec / 60}min
                    </button>
                  ))}
                </div>
              )}
              {!recording ? (
                <button onClick={startRecording} style={{ width: "100%", padding: "14px", fontSize: 16, background: "linear-gradient(135deg,#4CAF50,#2e7d32)", color: "white", border: "none", borderRadius: 12, cursor: "pointer", fontWeight: 700, letterSpacing: 0.3, boxShadow: "0 4px 20px rgba(76,175,80,0.4)" }}>
                  🎙️ Start Interview
                </button>
              ) : (
                <button onClick={stopRecording} style={{ width: "100%", padding: "14px", fontSize: 16, background: "linear-gradient(135deg,#f44336,#b71c1c)", color: "white", border: "none", borderRadius: 12, cursor: "pointer", fontWeight: 700, letterSpacing: 0.3, boxShadow: "0 4px 20px rgba(244,67,54,0.4)" }}>
                  ⏹️ Stop & Get Feedback
                </button>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
            <div style={{ ...glass, padding: 20, flex: 1 }}>
              <div style={{ fontSize: 11, color: t.subtext, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600 }}>🎤 Live Transcription</div>
              <p style={{ color: t.subtext, lineHeight: 1.7, minHeight: 80, margin: 0, fontSize: 14 }}>
                {text || "Speak to see your transcription here..."}
              </p>
            </div>

            <div style={{ ...glass, padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
                <div style={{ fontSize: 11, color: t.subtext, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600 }}>📈 Score Trend</div>
                <button onClick={resetSessions} style={{ fontSize: 12, background: "transparent", border: "1px solid #f44336", color: "#f44336", padding: "4px 12px", borderRadius: 20, cursor: "pointer" }}>
                  Reset
                </button>
              </div>

              {trendData.length > 1 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#43e97b" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#4facfe" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={t.rowBorder} strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fill: t.subtext, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: t.subtext, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={() => null} />
                    <Area type="monotone" dataKey="score" stroke="#43e97b" strokeWidth={2.5} fill="url(#scoreGrad)" dot={{ fill: "#43e97b", r: 4, strokeWidth: 0 }} activeDot={{ r: 6, fill: "#4facfe", strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ textAlign: "center", padding: "20px 0", color: t.subtext, fontSize: 13 }}>Complete 2+ sessions to see your trend 📊</div>
              )}

              <div style={{ marginTop: 12, maxHeight: 130, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${t.rowBorder}` }}>
                      <th style={{ padding: "6px 8px", textAlign: "left", color: t.subtext, fontWeight: 500 }}>Date</th>
                      <th style={{ padding: "6px 8px", textAlign: "left", color: t.subtext, fontWeight: 500 }}>Score</th>
                      <th style={{ padding: "6px 8px", textAlign: "left", color: t.subtext, fontWeight: 500 }}>Grade</th>
                      <th style={{ padding: "6px 8px", textAlign: "left", color: t.subtext, fontWeight: 500 }}>Eye%</th>
                      <th style={{ padding: "6px 8px", textAlign: "left", color: t.subtext, fontWeight: 500 }}>WPM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr key={s.id} style={{ borderBottom: `1px solid ${t.rowBorder}`, color: t.text }}>
                        <td style={{ padding: "6px 8px" }}>{s.date}</td>
                        <td style={{ padding: "6px 8px", fontWeight: 600, color: "#43e97b" }}>{s.score}</td>
                        <td style={{ padding: "6px 8px" }}>
                          <span style={{ background: gradeColor(s.grade), color: "white", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{s.grade}</span>
                        </td>
                        <td style={{ padding: "6px 8px" }}>{parseFloat(s.eye).toFixed(1)}%</td>
                        <td style={{ padding: "6px 8px" }}>{parseFloat(s.wpm).toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {loading && (
          <div className="fade-in-up" style={{ textAlign: "center", padding: 40, fontSize: 17, color: "#4CAF50", fontWeight: 600, letterSpacing: 0.3 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
            Analyzing your performance...
          </div>
        )}

        {scorecard && (
          <div className="fade-in-scale" style={{ ...glass, border: "1px solid rgba(76,175,80,0.3)", padding: 30, marginTop: 25 }}>
            <h2 style={{ margin: "0 0 24px", fontWeight: 800, fontSize: 22, letterSpacing: "-0.5px", background: "linear-gradient(90deg,#43e97b,#4facfe)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>🏆 Post-Interview Scorecard</h2>

            <div style={{ display: "flex", gap: 14, marginBottom: 28, flexWrap: "wrap" }}>
              {[
                { label: "Grade", value: scorecard.grade || "B", bg: gradeGradient(scorecard.grade), icon: "🎓" },
                { label: "Total Score", value: `${scorecard.total_score || 0}/100`, bg: "linear-gradient(135deg,#4facfe,#00f2fe)", icon: "⭐" },
                { label: "Eye Contact", value: `${scorecard.eye_contact}%`, bg: "linear-gradient(135deg,#f7971e,#ffd200)", icon: "👁️" },
                { label: "WPM", value: scorecard.wpm, bg: "linear-gradient(135deg,#a18cd1,#fbc2eb)", icon: "💬" },
                { label: "Filler Words", value: scorecard.filler_count, bg: "linear-gradient(135deg,#f44336,#ff6b6b)", icon: "⚠️" },
              ].map((item, i) => (
                <div key={item.label} className="score-card-item" style={{ background: item.bg, color: "white", padding: "18px 22px", borderRadius: 16, textAlign: "center", minWidth: 105, boxShadow: "0 6px 24px rgba(0,0,0,0.25)", animationDelay: `${i * 0.08}s` }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{item.icon}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px" }}>{item.value}</div>
                  <div style={{ fontSize: 11, marginTop: 4, opacity: 0.9, fontWeight: 500 }}>{item.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 25 }}>
              <div>
                <h3 style={{ marginBottom: 15, fontWeight: 700, fontSize: 16 }}>⭐ STAR Breakdown</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {["situation", "task", "action", "result"].map((key, i) => {
                    const score = scorecard[`${key}_score`] || 0;
                    const pct = (score / 25) * 100;
                    const colors = ["#43e97b", "#4facfe", "#f7971e", "#a18cd1"];
                    return (
                      <div key={key} className="fade-in-up" style={{ ...glass, padding: "12px 16px", animationDelay: `${i * 0.1}s` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ textTransform: "capitalize", fontWeight: 600, fontSize: 13, color: colors[i] }}>{key}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{score}/25</span>
                        </div>
                        <div style={{ background: t.rowBorder, borderRadius: 10, height: 6, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg,${colors[i]},${colors[(i+1)%4]})`, borderRadius: 10, transition: "width 1s ease" }} />
                        </div>
                        <div style={{ fontSize: 12, color: t.subtext, marginTop: 6 }}>{scorecard[`${key}_feedback`] || "-"}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 14, background: t.feedbackBg, padding: 16, borderRadius: 14, border: `1px solid rgba(76,175,80,0.2)` }}>
                  <div style={{ color: "#43e97b", marginBottom: 8, fontWeight: 700, fontSize: 13 }}>💡 Overall Feedback</div>
                  <p style={{ color: t.subtext, lineHeight: 1.7, margin: 0, fontSize: 13 }}>{scorecard.overall_feedback}</p>
                </div>
              </div>

              <div>
                <h3 style={{ marginBottom: 15, fontWeight: 700, fontSize: 16 }}>📡 Performance Radar</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke={darkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"} />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: t.subtext, fontSize: 12, fontWeight: 500 }} />
                    <Radar name="Score" dataKey="score" stroke="#43e97b" fill="url(#radarGrad)" fillOpacity={0.4} strokeWidth={2} />
                    <defs>
                      <linearGradient id="radarGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#43e97b" />
                        <stop offset="100%" stopColor="#4facfe" />
                      </linearGradient>
                    </defs>
                    <Tooltip contentStyle={{ background: darkMode ? "rgba(15,15,30,0.95)" : "rgba(255,255,255,0.95)", border: `1px solid ${t.cardBorder}`, color: t.text, borderRadius: 10, fontSize: 13 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;