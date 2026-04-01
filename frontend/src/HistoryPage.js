import React, { useState, useEffect } from "react";

function HistoryPage({ token, onBack, onLogout, darkMode }) {
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  const t = {
    bg: darkMode
      ? "linear-gradient(135deg, #0a0a18 0%, #12103a 35%, #0d1f3c 65%, #0a1628 100%)"
      : "linear-gradient(135deg, #dfe9f3 0%, #e8d5f5 40%, #d4eaf7 100%)",
    card: darkMode ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.72)",
    cardBorder: darkMode ? "rgba(255,255,255,0.09)" : "rgba(180,180,220,0.35)",
    text: darkMode ? "#eeeeff" : "#12122e",
    subtext: darkMode ? "#8888aa" : "#5555aa",
    navBg: darkMode ? "rgba(10,10,24,0.88)" : "rgba(255,255,255,0.88)",
    rowBorder: darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
    shadow: darkMode ? "0 8px 40px rgba(0,0,0,0.5)" : "0 8px 32px rgba(80,80,200,0.1)",
    feedbackBg: darkMode ? "rgba(0,0,0,0.25)" : "rgba(240,240,255,0.6)",
  };

  const glass = {
    background: t.card,
    border: `1px solid ${t.cardBorder}`,
    backdropFilter: "blur(20px)",
    borderRadius: 18,
    boxShadow: t.shadow,
  };

  const gradeColor = (g) => {
    if (g === "A") return "#4CAF50";
    if (g === "B") return "#2196F3";
    if (g === "C") return "#FF9800";
    return "#f44336";
  };

  useEffect(() => {
    fetch("http://localhost:8000/sessions", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => setSessions(data.sessions || []));
  }, [token]);

  const openSession = async (id) => {
    setLoading(true);
    const res = await fetch(`http://localhost:8000/sessions/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setSelected(data);
    setLoading(false);
  };

  return (
    <div style={{ fontFamily: "'Inter','Segoe UI',Arial,sans-serif", background: t.bg, minHeight: "100vh", color: t.text }}>
      {/* Navbar */}
      <div style={{ background: t.navBg, backdropFilter: "blur(20px)", padding: "14px 32px", borderBottom: `1px solid ${t.cardBorder}`, display: "flex", alignItems: "center", gap: 14, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ width: 10, height: 10, background: "#4CAF50", borderRadius: "50%", boxShadow: "0 0 8px #4CAF50" }} />
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: t.text }}>MockMentor AI</h2>
        <button onClick={() => selected ? setSelected(null) : onBack()} style={{ marginLeft: "auto", background: "rgba(76,175,80,0.15)", border: "1px solid rgba(76,175,80,0.4)", borderRadius: 20, padding: "6px 16px", cursor: "pointer", fontSize: 13, color: "#4CAF50", fontWeight: 500 }}>
          ← {selected ? "Back to History" : "Back"}
        </button>
        <button onClick={onLogout} style={{ background: "rgba(244,67,54,0.15)", border: "1px solid rgba(244,67,54,0.4)", borderRadius: 20, padding: "6px 16px", cursor: "pointer", fontSize: 13, color: "#f44336", fontWeight: 500 }}>
          Logout
        </button>
      </div>

      <div style={{ padding: 30, maxWidth: 900, margin: "0 auto" }}>

        {/* Session Detail View */}
        {selected ? (
          <div>
            <h2 style={{ fontWeight: 800, fontSize: 22, marginBottom: 24, background: "linear-gradient(90deg,#43e97b,#4facfe)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              📋 Session Detail — {selected.date}
            </h2>

            {/* Score cards */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
              {[
                { label: "Score", value: `${selected.score}/100`, color: "linear-gradient(135deg,#4facfe,#00f2fe)" },
                { label: "Grade", value: selected.grade, color: `linear-gradient(135deg,${gradeColor(selected.grade)},${gradeColor(selected.grade)}aa)` },
                { label: "Eye Contact", value: `${selected.eye_contact}%`, color: "linear-gradient(135deg,#f7971e,#ffd200)" },
                { label: "WPM", value: selected.wpm, color: "linear-gradient(135deg,#a18cd1,#fbc2eb)" },
                { label: "Filler Words", value: selected.filler_count, color: "linear-gradient(135deg,#f44336,#ff6b6b)" },
              ].map(item => (
                <div key={item.label} style={{ background: item.color, color: "white", padding: "14px 20px", borderRadius: 14, textAlign: "center", minWidth: 100, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{item.value}</div>
                  <div style={{ fontSize: 11, marginTop: 3, opacity: 0.9 }}>{item.label}</div>
                </div>
              ))}
            </div>

            {/* Question */}
            <div style={{ ...glass, padding: 20, marginBottom: 16, borderLeft: "3px solid #4CAF50" }}>
              <div style={{ fontSize: 11, color: "#4CAF50", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600 }}>🎯 Question</div>
              <div style={{ fontSize: 15, lineHeight: 1.6 }}>{selected.question}</div>
            </div>

            {/* Transcript */}
            <div style={{ ...glass, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: t.subtext, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600 }}>🎤 Your Answer</div>
              <div style={{ fontSize: 14, lineHeight: 1.8, color: t.subtext }}>{selected.transcript || "No transcript available"}</div>
            </div>

            {/* Feedback */}
            <div style={{ background: t.feedbackBg, padding: 20, borderRadius: 14, border: `1px solid rgba(76,175,80,0.2)` }}>
              <div style={{ color: "#43e97b", marginBottom: 8, fontWeight: 700, fontSize: 13 }}>💡 Overall Feedback</div>
              <p style={{ color: t.subtext, lineHeight: 1.7, margin: 0, fontSize: 14 }}>{selected.overall_feedback}</p>
            </div>
          </div>

        ) : (
          // Sessions List
          <div>
            <h2 style={{ fontWeight: 800, fontSize: 22, marginBottom: 24, background: "linear-gradient(90deg,#43e97b,#4facfe)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              📊 Session History
            </h2>

            {sessions.length === 0 ? (
              <div style={{ ...glass, padding: 40, textAlign: "center", color: t.subtext }}>
                No sessions yet. Start your first interview! 🎯
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {sessions.map((s, i) => (
                  <div key={s.id} onClick={() => openSession(s.id)}
                    style={{ ...glass, padding: "18px 22px", cursor: "pointer", display: "flex", alignItems: "center", gap: 16, transition: "transform 0.2s" }}
                    onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
                    onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: t.subtext, minWidth: 28 }}>#{sessions.length - i}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{s.date}</div>
                      <div style={{ fontSize: 12, color: t.subtext }}>👁️ {parseFloat(s.eye).toFixed(1)}% &nbsp;|&nbsp; 💬 {parseFloat(s.wpm).toFixed(1)} WPM &nbsp;|&nbsp; ⚠️ {s.filler_count} fillers</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "#43e97b" }}>{s.score}</div>
                      <span style={{ background: gradeColor(s.grade), color: "white", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{s.grade}</span>
                    </div>
                    <div style={{ color: t.subtext, fontSize: 18 }}>›</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loading && (
          <div style={{ textAlign: "center", padding: 40, color: "#4CAF50", fontSize: 16 }}>Loading...</div>
        )}
      </div>
    </div>
  );
}

export default HistoryPage;
