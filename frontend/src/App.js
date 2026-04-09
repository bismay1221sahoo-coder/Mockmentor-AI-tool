import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import AuthPage from "./AuthPage";
import ProfilePage from "./ProfilePage";
import HistoryPage from "./HistoryPage";
import { API_BASE, WS_BASE } from "./config";
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
  .skeleton {
    display: inline-block;
    height: 14px;
    width: 100%;
    border-radius: 8px;
    background: linear-gradient(90deg, rgba(255,255,255,0.12), rgba(255,255,255,0.24), rgba(255,255,255,0.12));
    background-size: 200% 100%;
    animation: shimmer 1.8s infinite;
  }
  @keyframes shimmer {
    0% { background-position: -150% 0; }
    100% { background-position: 150% 0; }
  }
`;

const ProgressRing = ({ radius, stroke, progress, color }) => {
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <svg height={radius * 2} width={radius * 2} style={{ transform: 'rotate(-90deg)' }}>
      <circle
        stroke="rgba(255,255,255,0.15)"
        fill="transparent"
        strokeWidth={stroke}
        r={normalizedRadius}
        cx={radius}
        cy={radius}
      />
      <circle
        stroke={color}
        fill="transparent"
        strokeWidth={stroke}
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={strokeDashoffset}
        r={normalizedRadius}
        cx={radius}
        cy={radius}
        style={{ transition: 'stroke-dashoffset 0.75s ease' }}
      />
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em" fill="white" fontSize="12" style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}>{`${Math.round(progress)}%`}</text>
    </svg>
  );
};

function App() {
  const videoRef = useRef(null);
  const wsRef = useRef(null);
  const recorderRef = useRef(null);

  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [recording, setRecording] = useState(false);
  const [fullTranscript, setFullTranscript] = useState("");
  const [faceStatus, setFaceStatus] = useState("Detecting...");
  const [lookingAwayCount, setLookingAwayCount] = useState(0);
  const [noFaceCount, setNoFaceCount] = useState(0);
  const [multipleFaceCount, setMultipleFaceCount] = useState(0);
  const [multiFaceWarnings, setMultiFaceWarnings] = useState(0);
  const [eyeScore, setEyeScore] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [fillerCount, setFillerCount] = useState(0);
  const [fillerBreakdown, setFillerBreakdown] = useState({});
  const [wordCount, setWordCount] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [question, setQuestion] = useState("");
  const [scorecard, setScorecard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [sessions, setSessions] = useState([]);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("darkMode") === "false" ? false : true);
  const [activePage, setActivePage] = useState("home");
  const [questionCategory, setQuestionCategory] = useState("Behavioral");
  const [selectedRole, setSelectedRole] = useState("General");
  const [selectedDifficulty, setSelectedDifficulty] = useState("auto");
  const [scorecardTab, setScorecardTab] = useState("STAR");
  const [animatedTotalScore, setAnimatedTotalScore] = useState(0);
  const [showTips, setShowTips] = useState(true);
  const [autoCleanTranscript, setAutoCleanTranscript] = useState(true);
  const [compactMode, setCompactMode] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(
    typeof window !== "undefined" ? window.innerWidth < 900 : false
  );
  const [focusMode, setFocusMode] = useState(false);
  const [analytics, setAnalytics] = useState({ total_sessions: 0, weekly_average: 0, trend_slope: 0, consistency_score: 0, series: [] });
  const [paceTimeline, setPaceTimeline] = useState([]);
  const [framingHint, setFramingHint] = useState("Frame looks good");
  const [framingIssueCount, setFramingIssueCount] = useState(0);
  const [reanswerMode, setReanswerMode] = useState(false);
  const [compareBaseline, setCompareBaseline] = useState(null);

  useEffect(() => {
    localStorage.setItem("darkMode", darkMode);
  }, [darkMode]);

  useEffect(() => {
    const onResize = () => setIsMobileViewport(window.innerWidth < 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
  const recordingRef = useRef(false);
  const eyeScoreRef = useRef(0);
  const totalFramesRef = useRef(0);
  const startTimeRef = useRef(null);
  const fullTranscriptRef = useRef("");
  const lastFaceEventRef = useRef("detecting");
  const lastFramingHintRef = useRef("Frame looks good");

  const [streak, setStreak] = useState(0);
  const [followupQuestion, setFollowupQuestion] = useState("");
  const [followupLoading, setFollowupLoading] = useState(false);
  const [followupRound, setFollowupRound] = useState(0);

  const transcriptBoxRef = useRef(null);

  useEffect(() => {
    if (transcriptBoxRef.current) {
      transcriptBoxRef.current.scrollTop = transcriptBoxRef.current.scrollHeight;
    }
  }, [fullTranscript]);

  const [customQuestion, setCustomQuestion] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  const evaluatingRef = useRef(false);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const handleLogin = (tok, me) => {
    localStorage.setItem("token", tok);
    setToken(tok);
    setUser(me);
  };

  const refreshQuestion = () => {
    const categories = ["Behavioral", "Technical", "Situational", "HR"];
    fetch(`${API_BASE}/question?role=${encodeURIComponent(selectedRole)}&difficulty=${encodeURIComponent(selectedDifficulty)}`, { headers: authHeaders })
      .then(res => res.json())
      .then(data => {
        setQuestion(data.question);
        setQuestionCategory(data.role || categories[Math.floor(Math.random() * categories.length)]);
        showToast("Question refreshed successfully");
      })
      .catch(() => showToast("Failed to refresh question"));
  };

  const handleLogout = useCallback(() => {
    localStorage.removeItem("token");
    setToken("");
    setUser(null);
    setSessions([]);
  }, []);

  useEffect(() => {
    if (!scorecard) {
      setAnimatedTotalScore(0);
      return;
    }
    const target = scorecard.total_score || 0;
    let current = 0;
    const step = Math.max(1, Math.ceil(target / 30));
    const interval = setInterval(() => {
      current += step;
      if (current >= target) {
        current = target;
        clearInterval(interval);
      }
      setAnimatedTotalScore(current);
    }, 30);
    return () => clearInterval(interval);
  }, [scorecard]);

  useEffect(() => {
    if (token && !user) {
      fetch(`${API_BASE}/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) setUser(data);
          else handleLogout();
        })
        .catch(() => {});
    }
  }, [token, user, handleLogout]);

  const fetchSessions = useCallback((tok) => {
    const headers = { Authorization: `Bearer ${tok || token}` };
    fetch(`${API_BASE}/sessions?limit=120`, { headers })
      .then(res => res.json())
      .then(data => setSessions(data.sessions || []))
      .catch(() => {});
    fetch(`${API_BASE}/streak`, { headers })
      .then(res => res.json())
      .then(data => setStreak(data.streak || 0))
      .catch(() => {});
    fetch(`${API_BASE}/analytics`, { headers })
      .then(res => res.json())
      .then(data => setAnalytics(data || { total_sessions: 0, weekly_average: 0, trend_slope: 0, consistency_score: 0, series: [] }))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const categories = ["Behavioral", "Technical", "Situational", "HR"];
    fetch(`${API_BASE}/question?role=${encodeURIComponent(selectedRole)}&difficulty=${encodeURIComponent(selectedDifficulty)}`, { headers: authHeaders })
      .then(res => res.json())
      .then(data => {
        setQuestion(data.question);
        setQuestionCategory(data.role || categories[Math.floor(Math.random() * categories.length)]);
      })
      .catch(() => {});
    fetchSessions(token);
  }, [token, selectedRole, selectedDifficulty, authHeaders, fetchSessions]);

  const cleanTranscriptText = (rawText) => {
    const text = (rawText || "").trim().replace(/\s+/g, " ");
    if (!text) return "";

    const withRecoveredSpaces = text
      // Handle merged words like "Iaminterested" -> "I am interested"
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([.!?])([A-Za-z])/g, "$1 $2")
      .replace(/(\d)([A-Za-z])/g, "$1 $2")
      .replace(/([A-Za-z])(\d)/g, "$1 $2");

    let normalized = withRecoveredSpaces
      .replace(/\bi\b/g, "I")
      .replace(/\s+([,.!?])/g, "$1")
      .replace(/([a-z0-9])\s+([A-Z])/g, "$1. $2");

    // Remove near-duplicate sentences introduced by streaming overlap.
    const sentences = normalized
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const deduped = [];
    const seen = new Set();
    for (const sentence of sentences) {
      const key = sentence.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(sentence);
    }

    normalized = deduped.join(" ").replace(/\s+/g, " ").trim();
    if (!/[.!?]$/.test(normalized)) normalized += ".";
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  };

  const fetchFollowupQuestion = async (round) => {
    setFollowupLoading(true);
    try {
      const transcriptForFollowup = autoCleanTranscript ? cleanTranscriptText(fullTranscriptRef.current) : fullTranscriptRef.current;
      const resp = await fetch(`${API_BASE}/followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          question,
          transcript: transcriptForFollowup,
          round,
          difficulty: selectedDifficulty === "auto" ? "medium" : selectedDifficulty,
        }),
      });
      const body = await resp.json();
      setFollowupQuestion(body.followup || "");
      setFollowupRound(body.round || round);
    } catch {
      setFollowupQuestion("Could you expand with deeper ownership and measurable results?");
      setFollowupRound(round);
    }
    setFollowupLoading(false);
  };

  useEffect(() => {
    if (!videoRef.current) return;
    const faceMesh = new FaceMesh({
     locateFile: (file) =>
  `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`,
    });
    faceMesh.setOptions({ maxNumFaces: 2, refineLandmarks: true });
    faceMesh.onResults((results) => {
      const faces = results.multiFaceLandmarks?.length || 0;

      if (faces > 1) {
        setFaceStatus("Multiple Faces Detected");
        if (recordingRef.current && lastFaceEventRef.current !== "multiple") {
          setMultipleFaceCount((prev) => prev + 1);
          setMultiFaceWarnings((prev) => {
            const nextWarnings = prev + 1;
            if (nextWarnings >= 2) {
              showToast("2 warnings reached: multiple faces detected. Auto-stopping.");
              stopRecordingRef.current?.();
            } else {
              showToast(`Warning ${nextWarnings}/2: only one face should be visible.`);
            }
            return nextWarnings;
          });
        }
        lastFaceEventRef.current = "multiple";
        return;
      }

      if (faces === 1) {
        const landmarks = results.multiFaceLandmarks[0];
        const leftEye = landmarks[33];
        const rightEye = landmarks[263];
        const nose = landmarks[1];
        const xs = landmarks.map((p) => p.x);
        const ys = landmarks.map((p) => p.y);
        const faceWidth = Math.max(...xs) - Math.min(...xs);
        const faceCenterX = (Math.max(...xs) + Math.min(...xs)) / 2;
        const faceCenterY = (Math.max(...ys) + Math.min(...ys)) / 2;

        let nextFramingHint = "Frame looks good";
        if (faceWidth < 0.22) nextFramingHint = "Move closer to camera";
        else if (faceWidth > 0.62) nextFramingHint = "Move a little back";
        else if (Math.abs(faceCenterX - 0.5) > 0.16 || Math.abs(faceCenterY - 0.5) > 0.2) nextFramingHint = "Center your face in frame";

        setFramingHint(nextFramingHint);
        if (recordingRef.current && nextFramingHint !== "Frame looks good" && lastFramingHintRef.current !== nextFramingHint) {
          setFramingIssueCount((prev) => prev + 1);
        }
        lastFramingHintRef.current = nextFramingHint;

        const eyeCenterX = (leftEye.x + rightEye.x) / 2;
        const diff = Math.abs(eyeCenterX - nose.x);
        setTotalFrames((prev) => prev + 1);
        totalFramesRef.current += 1;
        if (diff < 0.02) {
          setEyeScore((prev) => prev + 1);
          eyeScoreRef.current += 1;
          setFaceStatus("Looking at Camera");
          lastFaceEventRef.current = "camera";
        } else {
          setFaceStatus("Looking Away");
          if (recordingRef.current && lastFaceEventRef.current !== "away") {
            setLookingAwayCount((prev) => prev + 1);
          }
          lastFaceEventRef.current = "away";
        }
      } else {
        setFaceStatus("No Face Detected");
        if (recordingRef.current && lastFaceEventRef.current !== "none") {
          setNoFaceCount((prev) => prev + 1);
        }
        lastFaceEventRef.current = "none";
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
        const zone = currentWpm < 100 ? "slow" : currentWpm <= 150 ? "ideal" : "fast";
        setPaceTimeline((prev) => [...prev.slice(-23), { t: new Date().toLocaleTimeString([], { minute: "2-digit", second: "2-digit" }), wpm: Math.round(currentWpm), zone }]);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [recording, startTime, wordCount, fillerCount]);

  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  });

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording, selectedDuration]);

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
  }, [recording, selectedDuration]);

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    videoRef.current.srcObject = stream;
    const audioStream = new MediaStream(stream.getAudioTracks());
    setFaceStatus("Detecting...");
    setLookingAwayCount(0);
    setNoFaceCount(0);
    setMultipleFaceCount(0);
    setMultiFaceWarnings(0);
    setFramingHint("Frame looks good");
    setFramingIssueCount(0);
    setWordCount(0);
    setFillerCount(0);
    setFillerBreakdown({});
    setEyeScore(0);
    setTotalFrames(0);
    setFullTranscript("");
    setScorecard(null);
    eyeScoreRef.current = 0;
    totalFramesRef.current = 0;
    fullTranscriptRef.current = "";
    evaluatingRef.current = false;
    startTimeRef.current = null;
    lastFaceEventRef.current = "detecting";
    lastFramingHintRef.current = "Frame looks good";
    setPaceTimeline([]);

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(audioStream, { mimeType });
    recorderRef.current = recorder;
    chunksRef.current = [];

    const ws = new WebSocket(`${WS_BASE}/ws`);
    wsRef.current = ws;

    const countFillers = (text) => {
      const lowerText = text.toLowerCase();
      const fillers = ["um", "uh", "like", "you know", "basically"];
      const breakdown = {};
      let total = 0;
      fillers.forEach((f) => {
        const escaped = f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const matches = lowerText.match(new RegExp(`\\b${escaped}\\b`, "g")) || [];
        if (matches.length > 0) {
          breakdown[f] = matches.length;
          total += matches.length;
        }
      });
      return { total, breakdown };
    };

    const normalizeForMatch = (text) => (text || "").toLowerCase().replace(/\s+/g, " ").trim();

    const mergeTranscriptChunk = (previousText, incomingText) => {
      const prev = (previousText || "").trim();
      const next = (incomingText || "").trim();
      if (!next) return prev;
      if (!prev) return next;

      const prevNorm = normalizeForMatch(prev);
      const nextNorm = normalizeForMatch(next);

      if (nextNorm === prevNorm) return prev;
      if (nextNorm.startsWith(prevNorm)) return next;
      if (prevNorm.startsWith(nextNorm)) return prev;

      // If the new chunk is already mostly contained in the previous transcript, skip it.
      if (prevNorm.includes(nextNorm) && nextNorm.length > 20) return prev;

      // Suffix-prefix overlap merge to avoid repeated chunks.
      const maxOverlap = Math.min(prevNorm.length, nextNorm.length);
      let overlap = 0;
      for (let size = maxOverlap; size >= 15; size -= 1) {
        if (prevNorm.slice(-size) === nextNorm.slice(0, size)) {
          overlap = size;
          break;
        }
      }

      if (overlap > 0) {
        return `${prev} ${next.slice(overlap).trim()}`.replace(/\s+/g, " ").trim();
      }
      return `${prev} ${next}`.replace(/\s+/g, " ").trim();
    };

    ws.onmessage = (event) => {
      const newText = event.data.trim();
      if (!newText) return;
      const mergedText = mergeTranscriptChunk(fullTranscriptRef.current, newText);

      fullTranscriptRef.current = mergedText;
      setFullTranscript(mergedText);
      setWordCount(mergedText ? mergedText.split(/\s+/).length : 0);

      const fillerStats = countFillers(mergedText);
      setFillerCount(fillerStats.total);
      setFillerBreakdown(fillerStats.breakdown);
    };

    ws.onerror = (e) => console.error("WS error:", e);
    ws.onclose = () => console.log("WS closed");

    recorder.ondataavailable = (event) => {
      if (event.data.size < 100) return;
      chunksRef.current.push(event.data);
      // Send accumulated WebM so each payload remains a valid decodable media file.
      const blob = new Blob(chunksRef.current, { type: mimeType });
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(blob);
      }
    };

    recorder.onstop = () => {
      setTimeout(() => ws.close(), 2000);
    };

    ws.onopen = () => {
      console.log("WS open, starting recorder");
      const now = Date.now();
      setStartTime(now);
      startTimeRef.current = now;
      recorder.start(4000);
      setRecording(true);
    };
  };

  const stopRecording = async () => {
    if (evaluatingRef.current) return;
    evaluatingRef.current = true;
    if (recorderRef.current?.state && recorderRef.current.state !== "inactive") {
      recorderRef.current.requestData();
      recorderRef.current.stop();
    } else {
      wsRef.current?.close();
    }
    clearInterval(intervalRef.current);
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
    setRecording(false);
    const eyeContactPct = totalFramesRef.current > 0 ? (eyeScoreRef.current / totalFramesRef.current) * 100 : 0;
    const wpm = startTimeRef.current ? (wordCount / ((Date.now() - startTimeRef.current) / 60000)) : 0;
    const transcriptToEvaluate = autoCleanTranscript ? cleanTranscriptText(fullTranscriptRef.current) : fullTranscriptRef.current;
    if (autoCleanTranscript) {
      fullTranscriptRef.current = transcriptToEvaluate;
      setFullTranscript(transcriptToEvaluate);
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ question, transcript: transcriptToEvaluate, eye_contact: eyeContactPct, filler_count: fillerCount, wpm }),
      });
      const data = await res.json();
      if (reanswerMode && compareBaseline) {
        data.previous_score = compareBaseline.total_score || 0;
        data.score_delta = (data.total_score || 0) - (compareBaseline.total_score || 0);
      }
      setScorecard(data);
      fetchSessions();
      setFollowupQuestion("");
      await fetchFollowupQuestion(1);
      setReanswerMode(false);
      setCompareBaseline(null);
    } catch (e) {
      console.error("Evaluation failed:", e);
    }
    setLoading(false);
    evaluatingRef.current = false;
  };

  const resetSessions = async () => {
    await fetch(`${API_BASE}/sessions/reset`, { method: "DELETE", headers: authHeaders });
    setSessions([]);
  };

  const eyeContactPct = totalFrames > 0 ? ((eyeScore / totalFrames) * 100).toFixed(1) : 0;
  const wpm = startTime ? (wordCount / ((Date.now() - startTime) / 60000)).toFixed(1) : 0;
  const confidenceMeter = Math.min(100, Math.max(0, (parseFloat(eyeContactPct) || 0) * 0.75 + (100 - Math.min(parseFloat(wpm) || 0, 160)) * 0.25));

  const metricData = [
    { label: "Eye Contact", value: Math.round(parseFloat(eyeContactPct) || 0), color: "#4CAF50", icon: "👁️" },
    { label: "WPM", value: Math.min(100, Math.round((parseFloat(wpm) || 0) / 1.6)), color: "#2196F3", icon: "🗣️" },
    { label: "Filler", value: Math.min(100, fillerCount * 10), color: "#FF9800", icon: "🧩" },
    { label: "Fluency", value: Math.min(100, Math.round((wordCount / (selectedDuration || 1)) * 12)), color: "#9C27B0", icon: "🎙️" },
  ];

  const ScoreTrendTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: darkMode ? "rgba(9,12,28,0.9)" : "rgba(255,255,255,0.95)", border: `1px solid ${t.cardBorder}`, color: darkMode ? "#fff" : "#111", padding: 8, borderRadius: 10, fontSize: 12, boxShadow: "0 6px 24px rgba(0,0,0,0.25)" }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
          <div>Score: <strong>{payload[0].value}</strong></div>
          <div>Session #{trendData.length - payload[0].payloadIndex}</div>
        </div>
      );
    }
    return null;
  };

  const radarData = scorecard ? [
    { subject: "Situation", score: scorecard.situation_score || 0, fullMark: 25 },
    { subject: "Task", score: scorecard.task_score || 0, fullMark: 25 },
    { subject: "Action", score: scorecard.action_score || 0, fullMark: 25 },
    { subject: "Result", score: scorecard.result_score || 0, fullMark: 25 },
    { subject: "Eye Contact", score: Math.round(scorecard.eye_contact / 4) || 0, fullMark: 25 },
    { subject: "Fluency", score: Math.max(0, 25 - scorecard.filler_count * 2) || 0, fullMark: 25 },
  ] : [];

  const totalScoreUI = scorecard ? `${animatedTotalScore}/100` : "0/100";

  const trendData = [...sessions].reverse().map(s => ({ date: s.date, score: parseInt(s.score, 10) || 0 }));
  const compactLayout = compactMode || isMobileViewport;
  const analyticsCards = [
    { label: "Weekly Avg", value: analytics.weekly_average || 0, color: "#4facfe" },
    { label: "Trend Slope", value: analytics.trend_slope || 0, color: "#43e97b" },
    { label: "Consistency", value: `${analytics.consistency_score || 0}%`, color: "#f7b733" },
  ];
  const badges = [
    { id: "streak7", label: "7-Day Fire", unlocked: streak >= 7 },
    { id: "highscore", label: "90+ Master", unlocked: sessions.some((s) => (parseInt(s.score, 10) || 0) >= 90) },
    { id: "nofiller", label: "No Filler Hero", unlocked: sessions.some((s) => (parseInt(s.filler_count, 10) || 0) === 0) },
    { id: "consistent", label: "Consistency Pro", unlocked: (analytics.consistency_score || 0) >= 80 },
  ];

  const handleReanswer = () => {
    if (!question) return;
    setReanswerMode(true);
    setCompareBaseline(scorecard);
    startRecording();
  };

  const toggleFocusMode = async () => {
    if (!focusMode && document.documentElement.requestFullscreen) {
      try { await document.documentElement.requestFullscreen(); } catch {}
    } else if (focusMode && document.fullscreenElement && document.exitFullscreen) {
      try { await document.exitFullscreen(); } catch {}
    }
    setFocusMode((prev) => !prev);
  };

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

      {focusMode && (
        <button onClick={toggleFocusMode} style={{ position: "fixed", top: 18, right: 18, zIndex: 1100, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(0,0,0,0.45)", color: "#fff", borderRadius: 16, padding: "8px 12px", cursor: "pointer", fontSize: 12 }}>
          Exit Focus
        </button>
      )}

      {!focusMode && (
      <div style={{ background: t.navBg, backdropFilter: t.blur, WebkitBackdropFilter: t.blur, padding: "12px 28px", borderBottom: `1px solid ${t.cardBorder}`, display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 20px rgba(0,0,0,0.15)" }}>
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#4CAF50", boxShadow: "0 0 10px rgba(76,175,80,0.5)" }} />
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: t.text }}>MockMentor AI</h2>

        <div style={{ display: "flex", gap: 6, marginLeft: 24 }}>
          {[
            { key: "home", label: "Home" },
            { key: "profile", label: "Profile" },
            { key: "history", label: "History" }
          ].map(item => (
            <button key={item.key} onClick={() => { setActivePage(item.key); if (item.key === 'profile') setShowProfile(true); else if (item.key === 'history') setShowHistory(true); }}
              style={{
                padding: "8px 14px", borderRadius: 12, fontSize: 13, fontWeight: 600,
                border: `1px solid ${activePage === item.key ? "#43e97b" : "rgba(255,255,255,0.2)"}`,
                background: activePage === item.key ? "rgba(67,233,123,0.18)" : "transparent",
                color: activePage === item.key ? "#43e97b" : t.subtext, cursor: "pointer"
              }}>
              {item.label}
            </button>
          ))}
        </div>

        <span style={{ marginLeft: "auto", fontSize: 12, color: t.subtext, fontWeight: 500, letterSpacing: 0.5 }}>Interview Preparation Platform</span>
        <span style={{ fontSize: 11, color: "#4facfe", background: "rgba(79,172,254,0.12)", border: "1px solid rgba(79,172,254,0.35)", borderRadius: 14, padding: "4px 10px", fontWeight: 700 }}>
          {selectedRole} | {selectedDifficulty.toUpperCase()}
        </span>
        {streak > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, background: "linear-gradient(135deg,rgba(255,152,0,0.15),rgba(255,87,34,0.15))", border: "1px solid rgba(255,152,0,0.3)", borderRadius: 20, padding: "5px 14px" }}>
            <span style={{ fontSize: 15 }}>🔥</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#FF9800" }}>{streak} day streak</span>
          </div>
        )}
        <button onClick={() => setDarkMode(!darkMode)} style={{ marginLeft: 12, background: darkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)", border: `1px solid ${t.cardBorder}`, borderRadius: 20, padding: "6px 16px", cursor: "pointer", fontSize: 13, color: t.text, fontWeight: 500 }}>
          {darkMode ? "🌞 Light" : "🌙 Dark"}
        </button>
        <button onClick={() => setCompactMode((v) => !v)} style={{ marginLeft: 8, background: "rgba(79,172,254,0.12)", border: "1px solid rgba(79,172,254,0.35)", borderRadius: 20, padding: "6px 12px", cursor: "pointer", fontSize: 12, color: "#4facfe", fontWeight: 600 }}>
          {compactLayout ? "Desktop View" : "Compact Mode"}
        </button>
        <button onClick={toggleFocusMode} style={{ marginLeft: 8, background: "rgba(67,233,123,0.12)", border: "1px solid rgba(67,233,123,0.35)", borderRadius: 20, padding: "6px 12px", cursor: "pointer", fontSize: 12, color: "#43e97b", fontWeight: 600 }}>
          🎯 Focus
        </button>
        {user && <span style={{ fontSize: 13, color: t.subtext, marginLeft: 8 }}>👤 {user.name}</span>}
        <button onClick={handleLogout} style={{ marginLeft: 8, background: "rgba(244,67,54,0.15)", border: "1px solid rgba(244,67,54,0.4)", borderRadius: 20, padding: "6px 16px", cursor: "pointer", fontSize: 13, color: "#f44336", fontWeight: 500 }}>
          Logout
        </button>
      </div>
      )}

      <div style={{ padding: 30, maxWidth: 1100, margin: "0 auto" }}>

        {question && (
          <div className="fade-in-up" style={{ ...glass, padding: "20px 24px", marginBottom: 25, borderLeft: "3px solid #4CAF50" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "#4CAF50", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600 }}>💬 Interview Question</div>
              <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 12, background: "rgba(79,172,254,0.1)", color: "#4facfe", fontWeight: 700 }}>{questionCategory}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
              <div style={{ fontSize: 17, lineHeight: 1.6, color: t.text, fontWeight: 500, flex: 1, marginRight: 12 }}>{question}</div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button onClick={() => setShowCustomInput(v => !v)} style={{ background: "rgba(255,255,255,0.1)", border: `1px solid ${t.cardBorder}`, borderRadius: 14, padding: "8px 12px", color: t.text, fontSize: 12, cursor: "pointer" }}>✍️ Custom</button>
                <button onClick={refreshQuestion} style={{ background: "rgba(255,255,255,0.1)", border: `1px solid ${t.cardBorder}`, borderRadius: 14, padding: "8px 12px", color: t.text, fontSize: 12, cursor: "pointer" }}>🔄 Refresh</button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <select disabled={recording} value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} style={{ padding: "8px 10px", borderRadius: 10, border: `1px solid ${t.cardBorder}`, background: t.card, color: t.text, fontSize: 12, opacity: recording ? 0.65 : 1 }}>
                {["General", "SDE", "HR", "PM", "Analyst"].map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
              <select disabled={recording} value={selectedDifficulty} onChange={(e) => setSelectedDifficulty(e.target.value)} style={{ padding: "8px 10px", borderRadius: 10, border: `1px solid ${t.cardBorder}`, background: t.card, color: t.text, fontSize: 12, opacity: recording ? 0.65 : 1 }}>
                <option value="auto">Auto Difficulty</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
              <button onClick={() => setAutoCleanTranscript((v) => !v)} style={{ padding: "8px 10px", borderRadius: 10, border: `1px solid ${autoCleanTranscript ? "rgba(67,233,123,0.5)" : t.cardBorder}`, background: autoCleanTranscript ? "rgba(67,233,123,0.15)" : t.card, color: autoCleanTranscript ? "#43e97b" : t.text, fontSize: 12, cursor: "pointer" }}>
                {autoCleanTranscript ? "✅ Auto Clean ON" : "Auto Clean OFF"}
              </button>
              {scorecard && (
                <button onClick={handleReanswer} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,183,77,0.5)", background: "rgba(255,183,77,0.14)", color: "#ffb74d", fontSize: 12, cursor: "pointer" }}>
                  🔁 Re-answer
                </button>
              )}
            </div>
            <div style={{ fontSize: 11, color: t.subtext, marginTop: 6 }}>
              {recording ? "Role and difficulty are locked while recording." : "Tip: use Auto for adaptive difficulty progression."}
            </div>
            {showCustomInput && (
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <input
                  value={customQuestion}
                  onChange={e => setCustomQuestion(e.target.value)}
                  placeholder="Type your own interview question..."
                  style={{ flex: 1, padding: "10px 14px", borderRadius: 12, border: `1px solid ${t.cardBorder}`, background: t.card, color: t.text, fontSize: 14, outline: "none" }}
                />
                <button
                  onClick={() => { if (customQuestion.trim()) { setQuestion(customQuestion.trim()); setCustomQuestion(""); setShowCustomInput(false); showToast("Custom question set!"); } }}
                  style={{ padding: "10px 18px", borderRadius: 12, background: "linear-gradient(135deg,#4CAF50,#2e7d32)", color: "white", border: "none", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                  Set
                </button>
              </div>
            )}
          </div>
        )}

        {!focusMode && <div style={{ ...glass, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#4facfe" }}>📊 Analytics Dashboard</div>
            <div style={{ fontSize: 11, color: t.subtext }}>Total Sessions: {analytics.total_sessions || 0}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: compactLayout ? "1fr" : "repeat(3, 1fr)", gap: 10 }}>
            {analyticsCards.map((card) => (
              <div key={card.label} style={{ border: `1px solid ${card.color}55`, background: `${card.color}12`, borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: t.subtext }}>{card.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: card.color }}>{card.value}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: t.subtext, marginBottom: 6 }}>🏆 Achievement Badges</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {badges.map((b) => (
                <span key={b.id} style={{ padding: "6px 10px", borderRadius: 20, fontSize: 11, border: `1px solid ${b.unlocked ? "rgba(67,233,123,0.45)" : "rgba(255,255,255,0.18)"}`, color: b.unlocked ? "#43e97b" : t.subtext, background: b.unlocked ? "rgba(67,233,123,0.12)" : "rgba(255,255,255,0.04)", fontWeight: 700 }}>
                  {b.unlocked ? "✅" : "🔒"} {b.label}
                </span>
              ))}
            </div>
          </div>
        </div>}

        <div style={{ display: "grid", gridTemplateColumns: compactLayout ? "1fr" : "1fr 1fr", gap: 25 }}>
          <div>
            <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#000" }}>
              <video ref={videoRef} autoPlay muted style={{ width: "100%", display: "block" }} />
              <div style={{ position: "absolute", bottom: 10, left: 10, background: faceStatus === "Looking at Camera" ? "rgba(76,175,80,0.85)" : "rgba(244,67,54,0.85)", padding: "5px 12px", borderRadius: 20, fontSize: 13, fontWeight: 600 }}>{faceStatus}</div>
              <div style={{ position: "absolute", bottom: 10, right: 10, background: framingHint === "Frame looks good" ? "rgba(76,175,80,0.8)" : "rgba(255,152,0,0.85)", padding: "5px 10px", borderRadius: 14, fontSize: 11, fontWeight: 700 }}>
                📐 {framingHint}
              </div>
              <div style={{ position: "absolute", top: 10, left: 10, right: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "rgba(0,0,0,0.3)", padding: "6px 10px", borderRadius: 12, fontSize: 12 }}>
                <span style={{ color: "#b1d8ff" }}>Confidence Meter</span>
                <div style={{ flex: 1, height: 8, borderRadius: 6, background: "rgba(255,255,255,0.2)", overflow: "hidden", margin: "0 10px" }}>
                  <div style={{ width: `${confidenceMeter}%`, height: "100%", background: `linear-gradient(90deg, #4CAF50, #00BCD4)` }} />
                </div>
                <span style={{ fontWeight: 700, color: "#fff" }}>{Math.round(confidenceMeter)}%</span>
              </div>
              {recording && (
                <div style={{ position: "absolute", top: 42, right: 10, display: "flex", alignItems: "center", gap: 6, background: timer < 30 ? "rgba(200,0,0,0.92)" : "rgba(180,0,0,0.82)", padding: "5px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, backdropFilter: "blur(6px)", boxShadow: "0 2px 12px rgba(255,0,0,0.3)" }}>
                  <div style={{ width: 8, height: 8, background: "white", borderRadius: "50%", animation: "pulse 1s infinite" }}></div>
                  REC &nbsp;{formatTime(timer)}
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 15 }}>
              {metricData.map((item) => (
                <div key={item.label} style={{ ...glass, padding: "16px 10px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  <ProgressRing radius={45} stroke={6} progress={item.value} color={item.color} />
                  <div style={{ fontSize: 11, color: t.subtext, fontWeight: 600 }}>{item.icon} {item.label}</div>
                </div>
              ))}
            </div>

            <div style={{ ...glass, marginTop: 12, padding: "10px 12px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div style={{ textAlign: "center", background: "rgba(255,152,0,0.12)", border: "1px solid rgba(255,152,0,0.3)", borderRadius: 10, padding: "8px 6px" }}>
                <div style={{ fontSize: 11, color: "#ffb74d", fontWeight: 700 }}>🙈 Looking Away</div>
                <div style={{ fontSize: 18, color: "#ffd180", fontWeight: 800 }}>{lookingAwayCount}</div>
              </div>
              <div style={{ textAlign: "center", background: "rgba(244,67,54,0.12)", border: "1px solid rgba(244,67,54,0.35)", borderRadius: 10, padding: "8px 6px" }}>
                <div style={{ fontSize: 11, color: "#ef9a9a", fontWeight: 700 }}>🚫 No Face</div>
                <div style={{ fontSize: 18, color: "#ffcdd2", fontWeight: 800 }}>{noFaceCount}</div>
              </div>
              <div style={{ textAlign: "center", background: "rgba(156,39,176,0.12)", border: "1px solid rgba(156,39,176,0.35)", borderRadius: 10, padding: "8px 6px" }}>
                <div style={{ fontSize: 11, color: "#ce93d8", fontWeight: 700 }}>👥 Multiple Faces</div>
                <div style={{ fontSize: 18, color: "#e1bee7", fontWeight: 800 }}>{multipleFaceCount}</div>
                <div style={{ fontSize: 10, color: "#ce93d8" }}>Warnings: {multiFaceWarnings}/2</div>
                <div style={{ fontSize: 10, color: "#ce93d8" }}>Frame issues: {framingIssueCount}</div>
              </div>
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
                  🎬 Start Interview
                </button>
              ) : (
                <button onClick={stopRecording} style={{ width: "100%", padding: "14px", fontSize: 16, background: "linear-gradient(135deg,#f44336,#b71c1c)", color: "white", border: "none", borderRadius: 12, cursor: "pointer", fontWeight: 700, letterSpacing: 0.3, boxShadow: "0 4px 20px rgba(244,67,54,0.4)" }}>
                  ⏹️ Stop & Get Feedback
                </button>
              )}
            </div>

            {recording && showTips && (
              <div style={{ ...glass, marginTop: 12, padding: 15, border: `1px solid ${t.cardBorder}`, background: darkMode ? "rgba(10,15,35,0.72)" : "rgba(255,255,255,0.75)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#43e97b", marginBottom: 6 }}>💡 Live Interview Tips</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: t.subtext, lineHeight: 1.5, fontSize: 13 }}>
                  <li>Keep your shoulders relaxed and face the camera squarely.</li>
                  <li>Speak with a clear pace and avoid rushing to fill silence.</li>
                  <li>Use concise examples for each STAR point.</li>
                  <li>Minimize repetitive filler words by practicing brief pauses.</li>
                </ul>
                <button onClick={() => setShowTips(false)} style={{ marginTop: 10, border: "none", background: "transparent", color: "#ffb74d", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>Hide tips</button>
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
            <div style={{ ...glass, padding: 20, flex: 1 }}>
              <div style={{ fontSize: 11, color: t.subtext, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600 }}>📝 Live Transcription</div>
              <div ref={transcriptBoxRef} style={{ color: t.subtext, lineHeight: 1.7, minHeight: 120, maxHeight: 200, overflowY: "auto", overflowX: "hidden", margin: 0, fontSize: 14, paddingRight: 6, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
                {fullTranscript ? (
                  <p style={{ margin: 0, color: t.text, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {fullTranscript.split(/\s+/).map((word, idx) => {
                      const lower = word.replace(/[^a-zA-Z]/g, "").toLowerCase();
                      const isFiller = ["um", "uh", "like", "you know", "basically"].includes(lower);
                      return (
                        <span key={idx} style={{ color: isFiller ? "#FFB74D" : t.text, background: isFiller ? "rgba(255,183,77,0.2)" : "transparent", borderRadius: 4, marginRight: 4 }}>{word}</span>
                      );
                    })}
                  </p>
                ) : <span style={{ opacity: 0.7 }}>Speak to see your transcription here...</span>}
              </div>
              {recording && Object.keys(fillerBreakdown).length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                  {Object.entries(fillerBreakdown).map(([word, cnt]) => (
                    <span key={word} style={{ background: "rgba(255,183,77,0.15)", border: "1px solid rgba(255,183,77,0.3)", color: "#FFB74D", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{word}: {cnt}</span>
                  ))}
                </div>
              )}
            </div>

            <div style={{ ...glass, padding: 16 }}>
              <div style={{ fontSize: 11, color: t.subtext, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600 }}>⏱️ Speaking Pace Zones</div>
              {paceTimeline.length === 0 ? (
                <div style={{ fontSize: 12, color: t.subtext }}>Start speaking to see pace timeline.</div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 10, marginBottom: 8, fontSize: 10, color: t.subtext, flexWrap: "wrap" }}>
                    <span style={{ color: "#43e97b" }}>Ideal: 100-150 WPM</span>
                    <span style={{ color: "#ffb74d" }}>Slow: under 100</span>
                    <span style={{ color: "#ef5350" }}>Fast: above 150</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                  {paceTimeline.map((point, idx) => {
                    const zoneColor = point.zone === "ideal" ? "#43e97b" : point.zone === "fast" ? "#f44336" : "#ffb74d";
                    return (
                      <div key={`${point.t}-${idx}`} style={{ minWidth: 58, textAlign: "center", border: `1px solid ${zoneColor}55`, background: `${zoneColor}18`, borderRadius: 10, padding: "6px 4px" }}>
                        <div style={{ fontSize: 11, color: zoneColor, fontWeight: 700 }}>{point.wpm}</div>
                        <div style={{ fontSize: 9, color: t.subtext }}>{point.zone}</div>
                        <div style={{ fontSize: 9, color: t.subtext }}>{point.t}</div>
                      </div>
                    );
                  })}
                  </div>
                </>
              )}
            </div>

            <div style={{ ...glass, padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 11, color: t.subtext, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600 }}>📈 Score Trend</div>
                  <span style={{ background: "rgba(76,175,80,0.15)", color: "#4CAF50", padding: "2px 9px", borderRadius: 12, fontSize: 10, fontWeight: 700 }}>{sessions.length} sessions</span>
                </div>
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
                    <Tooltip content={<ScoreTrendTooltip />} />
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
          <div className="fade-in-up" style={{ padding: 24, borderRadius: 18, background: t.card, border: `1px solid ${t.cardBorder}`, boxShadow: t.shadow, marginTop: 20 }}>
            <div style={{ height: 30, width: 30, margin: "0 auto 16px", borderRadius: "50%", background: "rgba(255,255,255,0.1)" }} />
            <div className="skeleton" style={{ width: "80%", margin: "0 auto 8px" }} />
            <div className="skeleton" style={{ width: "70%", margin: "8px auto" }} />
            <div className="skeleton" style={{ width: "85%", margin: "8px auto" }} />
          </div>
        )}

        {scorecard && (
          <div className="fade-in-scale" style={{ ...glass, border: "1px solid rgba(76,175,80,0.3)", padding: 30, marginTop: 25 }}>
            <h2 style={{ margin: "0 0 24px", fontWeight: 800, fontSize: 22, letterSpacing: "-0.5px", background: "linear-gradient(90deg,#43e97b,#4facfe)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>📋 Post-Interview Scorecard</h2>

            <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
                {[
                  { label: "Grade", value: scorecard.grade || "B", bg: gradeGradient(scorecard.grade), icon: "🏅" },
                { label: "Total Score", value: totalScoreUI, bg: "linear-gradient(135deg,#4facfe,#00f2fe)", icon: "🎯" },
                { label: "Eye Contact", value: `${parseFloat(scorecard.eye_contact || 0).toFixed(1)}%`, bg: "linear-gradient(135deg,#f7971e,#ffd200)", icon: "👁️" },
                { label: "WPM", value: parseFloat(scorecard.wpm || 0).toFixed(1), bg: "linear-gradient(135deg,#a18cd1,#fbc2eb)", icon: "🗣️" },
                { label: "Filler Words", value: scorecard.filler_count || 0, bg: "linear-gradient(135deg,#f44336,#ff6b6b)", icon: "🧩" },
              ].map((item, i) => (
                <div key={item.label} className="score-card-item" style={{ background: item.bg, color: "white", padding: "18px 22px", borderRadius: 16, textAlign: "center", minWidth: 105, boxShadow: "0 6px 24px rgba(0,0,0,0.25)", animationDelay: `${i * 0.08}s` }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{item.icon}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px" }}>{item.value}</div>
                  <div style={{ fontSize: 11, marginTop: 4, opacity: 0.9, fontWeight: 500 }}>{item.label}</div>
                </div>
              ))}
            </div>

            {typeof scorecard.score_delta === "number" && (
              <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 12, border: `1px solid ${scorecard.score_delta >= 0 ? "rgba(67,233,123,0.4)" : "rgba(244,67,54,0.4)"}`, background: scorecard.score_delta >= 0 ? "rgba(67,233,123,0.12)" : "rgba(244,67,54,0.12)", color: scorecard.score_delta >= 0 ? "#43e97b" : "#ef5350", fontWeight: 700, fontSize: 13 }}>
                Re-answer comparison: {scorecard.previous_score}/100 -> {scorecard.total_score}/100 ({scorecard.score_delta >= 0 ? "+" : ""}{scorecard.score_delta})
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              { ["STAR", "Radar", "Tips"].map(tab => (
                <button key={tab} onClick={() => setScorecardTab(tab)} style={{ padding: "8px 13px", borderRadius: 12, border: `1px solid ${scorecardTab===tab ? "#43e97b" : t.cardBorder}`, background: scorecardTab===tab ? "rgba(67,233,123,0.16)" : "transparent", color: scorecardTab===tab ? "#43e97b" : t.text, cursor: "pointer", fontWeight: scorecardTab===tab ? 700 : 600, fontSize: 13 }}>
                  {tab}
                </button>
              )) }
            </div>

            {scorecardTab === "STAR" && (
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
                    <div style={{ color: "#43e97b", marginBottom: 8, fontWeight: 700, fontSize: 13 }}>✅ Overall Feedback</div>
                    <p style={{ color: t.subtext, lineHeight: 1.7, margin: 0, fontSize: 13 }}>{scorecard.overall_feedback}</p>
                  </div>
                </div>

                <div style={{ ...glass, padding: 20 }}>
                  <h3 style={{ marginBottom: 15, fontWeight: 700, fontSize: 16 }}>🧠 General Improvement Tips</h3>
                  <ul style={{ margin: 0, paddingLeft: 18, color: t.subtext, lineHeight: 1.5 }}>
                    <li>Keep responses structured in STAR format.</li>
                    <li>Look at the camera and maintain steady pace.</li>
                    <li>Use positive language and avoid filler words.</li>
                    <li>Highlight measurable results where possible.</li>
                    <li>Practice 3x before next recording session.</li>
                  </ul>
                </div>
              </div>
            )}

            {scorecardTab === "Radar" && (
              <div>
                <h3 style={{ marginBottom: 15, fontWeight: 700, fontSize: 16 }}>🎯 Performance Radar</h3>
                <ResponsiveContainer width="100%" height={320}>
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
            )}

            {scorecardTab === "Tips" && (
              <div style={{ ...glass, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontWeight: 700, color: "#4CAF50" }}>⚡ Quick Tips While Recording</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: t.subtext, lineHeight: 1.5 }}>
                  <li>Maintain eye contact with the camera for at least 70% of the time.</li>
                  <li>Use the STAR format: Situation, Task, Action, Result.</li>
                  <li>Avoid filler words; pause instead of saying um/uh.</li>
                  <li>Stay concise: aim for 1.5-2 minutes per response.</li>
                  <li>Check your confidence meter and adjust based on pace.</li>
                </ul>
                <div style={{ fontSize: 12, color: t.text, background: "rgba(255,255,255,0.08)", padding: 10, borderRadius: 10 }}>
                  {confidenceMeter > 70 ? "Great confidence. Keep consistent." : "Try to slow down and articulate clearly."}
                </div>
              </div>
            )}
          </div>
        )}

        {(followupQuestion || followupLoading) && (
          <div className="fade-in-up" style={{ ...glass, marginTop: 18, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#4facfe" }}>🧠 AI Follow-up Round {followupRound || 1}</div>
              <div style={{ fontSize: 11, color: t.subtext }}>
                Progress: {Math.min(followupRound || 1, 3)}/3
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => fetchFollowupQuestion(Math.max(1, followupRound + 1))} disabled={followupLoading || followupRound >= 3} style={{ border: "1px solid rgba(79,172,254,0.45)", background: "rgba(79,172,254,0.16)", color: "#4facfe", borderRadius: 10, padding: "6px 10px", fontSize: 12, cursor: followupLoading || followupRound >= 3 ? "not-allowed" : "pointer", opacity: followupLoading || followupRound >= 3 ? 0.5 : 1 }}>
                  Next Round
                </button>
                <button onClick={() => fetchFollowupQuestion(1)} disabled={followupLoading} style={{ border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.08)", color: t.text, borderRadius: 10, padding: "6px 10px", fontSize: 12, cursor: followupLoading ? "not-allowed" : "pointer", opacity: followupLoading ? 0.5 : 1 }}>
                  Regenerate
                </button>
              </div>
            </div>
            <div style={{ fontSize: 14, color: t.text, lineHeight: 1.6 }}>
              {followupLoading ? "Generating follow-up..." : followupQuestion}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
