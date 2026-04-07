import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import jsPDF from "jspdf";
import { API_BASE } from "./config";

const BASE = API_BASE;

const gradeColor = (g) => ({ A: "#10b981", B: "#06b6d4", C: "#f59e0b", D: "#ef4444", F: "#ef4444" }[g] || "#6b6b8a");
const gradeGlow = (g) => ({ A: "rgba(16,185,129,0.3)", B: "rgba(6,182,212,0.3)", C: "rgba(245,158,11,0.3)", D: "rgba(239,68,68,0.3)", F: "rgba(239,68,68,0.3)" }[g] || "transparent");

const glass = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.07)",
  backdropFilter: "blur(20px)",
  borderRadius: 16,
  boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
};

const StatBadge = ({ label, value, color }) => (
  <div style={{ background: `${color}15`, border: `1px solid ${color}30`, borderRadius: 10, padding: "10px 16px", textAlign: "center", minWidth: 90 }}>
    <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
    <div style={{ fontSize: 10, color: "#6b6b8a", marginTop: 3, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
  </div>
);

export default function HistoryPage({ token, onBack, onLogout }) {
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/sessions`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setSessions(d.sessions || []));
  }, [token]);

  const openSession = async (id) => {
    setLoading(true);
    const data = await (await fetch(`${BASE}/sessions/${id}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    setSelected(data);
    setLoading(false);
  };

  const exportPDF = (s) => {
    const doc = new jsPDF();
    const w = doc.internal.pageSize.getWidth();
    let y = 20;
    const line = (text, size = 11, color = [180, 180, 200], bold = false) => {
      doc.setFontSize(size);
      doc.setTextColor(...color);
      doc.setFont("helvetica", bold ? "bold" : "normal");
      const lines = doc.splitTextToSize(text, w - 40);
      lines.forEach(l => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(l, 20, y);
        y += size * 0.5 + 2;
      });
      y += 2;
    };
    doc.setFillColor(10, 10, 30);
    doc.rect(0, 0, w, 297, "F");
    line("MockMentor AI — Interview Report", 18, [100, 220, 150], true);
    line(`Date: ${s.date}`, 11, [120, 120, 180]);
    y += 4;
    line("SCORES", 10, [100, 100, 160], true);
    line(`Score: ${s.score}/100   Grade: ${s.grade}   Eye Contact: ${parseFloat(s.eye_contact).toFixed(1)}%   WPM: ${parseFloat(s.wpm).toFixed(1)}   Fillers: ${s.filler_count}`, 11, [200, 200, 230]);
    y += 4;
    line("QUESTION", 10, [100, 100, 160], true);
    line(s.question || "-", 11, [200, 200, 230]);
    y += 4;
    line("YOUR ANSWER", 10, [100, 100, 160], true);
    line(s.transcript || "No transcript", 11, [180, 180, 210]);
    y += 4;
    line("OVERALL FEEDBACK", 10, [100, 200, 150], true);
    line(s.overall_feedback || "-", 11, [180, 210, 190]);
    doc.save(`MockMentor_${String(s.date || "session").replace(/ /g, "_")}.pdf`);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#050508", fontFamily: "'Inter',sans-serif", color: "#f0f0ff" }}>

      {/* Ambient orbs */}
      <div style={{ position: "fixed", top: "-15%", right: "-10%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,58,237,0.1) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: "-15%", left: "-10%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* Navbar */}
      <div style={{ background: "rgba(5,5,8,0.85)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "14px 32px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
        <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: "-0.3px" }}>MockMentor AI</span>
        <motion.button onClick={() => selected ? setSelected(null) : onBack()}
          style={{ marginLeft: "auto", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 20, padding: "7px 18px", color: "#10b981", fontSize: 13, fontWeight: 600 }}
          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
          ← {selected ? "Back to History" : "Back"}
        </motion.button>
        <motion.button onClick={onLogout}
          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 20, padding: "7px 18px", color: "#ef4444", fontSize: 13, fontWeight: 600 }}
          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
          Logout
        </motion.button>
      </div>

      <div style={{ padding: "32px 28px", maxWidth: 900, margin: "0 auto" }}>
        <AnimatePresence mode="wait">

          {/* Session Detail */}
          {selected ? (
            <motion.div key="detail" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.35 }}>
              <div style={{ marginBottom: 28, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 11, color: "#6b6b8a", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600, marginBottom: 6 }}>Session Detail</div>
                  <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px", margin: 0 }}>{selected.date}</h2>
                </div>
                <motion.button
                  onClick={() => exportPDF(selected)}
                  style={{ background: "linear-gradient(135deg,#7c3aed,#06b6d4)", border: "none", borderRadius: 12, padding: "10px 20px", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                  📥 Export PDF
                </motion.button>
              </div>

              <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
                <StatBadge label="Score" value={`${selected.score}/100`} color="#7c3aed" />
                <StatBadge label="Grade" value={selected.grade} color={gradeColor(selected.grade)} />
                <StatBadge label="Eye Contact" value={`${parseFloat(selected.eye_contact).toFixed(1)}%`} color="#f59e0b" />
                <StatBadge label="WPM" value={parseFloat(selected.wpm).toFixed(1)} color="#06b6d4" />
                <StatBadge label="Fillers" value={selected.filler_count} color="#ef4444" />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ ...glass, padding: 20, borderLeft: "3px solid #7c3aed" }}>
                  <div style={{ fontSize: 10, color: "#7c3aed", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, marginBottom: 10 }}>🎯 Question</div>
                  <div style={{ fontSize: 15, lineHeight: 1.7, color: "#d4d4f0" }}>{selected.question}</div>
                </div>

                <div style={{ ...glass, padding: 20 }}>
                  <div style={{ fontSize: 10, color: "#6b6b8a", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, marginBottom: 10 }}>🎤 Your Answer</div>
                  <div style={{ fontSize: 14, lineHeight: 1.8, color: "#8888aa" }}>{selected.transcript || "No transcript available"}</div>
                </div>

                <div style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.15)", borderRadius: 16, padding: 20 }}>
                  <div style={{ fontSize: 10, color: "#10b981", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, marginBottom: 10 }}>💡 Overall Feedback</div>
                  <p style={{ fontSize: 14, lineHeight: 1.8, color: "#8888aa", margin: 0 }}>{selected.overall_feedback}</p>
                </div>
              </div>
            </motion.div>

          ) : (
            // Sessions List
            <motion.div key="list" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.35 }}>
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 11, color: "#6b6b8a", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600, marginBottom: 6 }}>Your Progress</div>
                <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px" }}>Session History</h2>
              </div>

              {sessions.length === 0 ? (
                <motion.div style={{ ...glass, padding: 60, textAlign: "center" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div style={{ fontSize: 40, marginBottom: 14 }}>🎯</div>
                  <div style={{ color: "#6b6b8a", fontSize: 15 }}>No sessions yet. Start your first interview!</div>
                </motion.div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {sessions.map((s, i) => (
                    <motion.div key={s.id} onClick={() => openSession(s.id)}
                      style={{ ...glass, padding: "18px 22px", cursor: "pointer", display: "flex", alignItems: "center", gap: 16 }}
                      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                      whileHover={{ y: -2, background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)" }}>

                      <div style={{ width: 44, height: 44, borderRadius: 12, background: `${gradeColor(s.grade)}20`, border: `1px solid ${gradeColor(s.grade)}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: gradeColor(s.grade), flexShrink: 0, boxShadow: `0 0 16px ${gradeGlow(s.grade)}` }}>
                        {s.grade}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{s.date}</div>
                        <div style={{ fontSize: 12, color: "#6b6b8a" }}>
                          👁️ {parseFloat(s.eye).toFixed(1)}% &nbsp;·&nbsp; 💬 {parseFloat(s.wpm).toFixed(1)} WPM &nbsp;·&nbsp; ⚠️ {s.filler_count} fillers
                        </div>
                      </div>

                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: "#10b981", letterSpacing: "-0.5px" }}>{s.score}</div>
                        <div style={{ fontSize: 10, color: "#6b6b8a", fontWeight: 500 }}>/ 100</div>
                      </div>

                      <div style={{ color: "#6b6b8a", fontSize: 18, flexShrink: 0 }}>›</div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {loading && (
          <div style={{ textAlign: "center", padding: 40, color: "#7c3aed", fontSize: 14 }}>
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} style={{ display: "inline-block", fontSize: 24, marginBottom: 10 }}>⟳</motion.div>
            <div>Loading session...</div>
          </div>
        )}
      </div>
    </div>
  );
}
