import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { API_BASE } from "./config";

const BASE = API_BASE;

const gradeColor = (g) => ({ A: "#10b981", B: "#06b6d4", C: "#f59e0b", D: "#ef4444", F: "#ef4444" }[g] || "#6b6b8a");

const glass = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.07)",
  backdropFilter: "blur(20px)",
  borderRadius: 18,
  boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
};

const inputStyle = {
  width: "100%", padding: "12px 14px", borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.04)",
  color: "#f0f0ff", fontSize: 14, outline: "none",
  boxSizing: "border-box", transition: "border-color 0.2s",
};

export default function ProfilePage({ token, onBack, onLogout }) {
  const [profile, setProfile] = useState(null);
  const [editName, setEditName] = useState("");
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setProfile(d); setEditName(d.name); });
  }, [token]);

  const handleUpdate = async (e) => {
    e.preventDefault(); setLoading(true); setMsg("");
    const body = {};
    if (editName !== profile.name) body.name = editName;
    if (newPwd) { body.current_password = currentPwd; body.new_password = newPwd; }
    if (!Object.keys(body).length) { setMsg("No changes made."); setLoading(false); return; }
    try {
      const res = await fetch(`${BASE}/profile/update`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) setMsg("❌ " + (data.detail || "Update failed"));
      else { setMsg("✅ Profile updated!"); setProfile(p => ({ ...p, name: editName })); setCurrentPwd(""); setNewPwd(""); }
    } catch { setMsg("❌ Server error"); }
    setLoading(false);
  };

  if (!profile) return (
    <div style={{ minHeight: "100vh", background: "#050508", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b6b8a", fontFamily: "'Inter',sans-serif" }}>
      <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.5 }}>Loading profile...</motion.div>
    </div>
  );

  const stats = [
    { label: "Total Sessions", value: profile.total_sessions, icon: "🎯", color: "#7c3aed" },
    { label: "Avg Score", value: `${profile.avg_score}/100`, icon: "⭐", color: "#06b6d4" },
    { label: "Best Score", value: profile.best_score, icon: "🏆", color: "#10b981" },
    { label: "Worst Score", value: profile.worst_score, icon: "📉", color: "#ef4444" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#050508", fontFamily: "'Inter',sans-serif", color: "#f0f0ff" }}>

      {/* Ambient */}
      <div style={{ position: "fixed", top: "-15%", left: "-10%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,58,237,0.1) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* Navbar */}
      <div style={{ background: "rgba(5,5,8,0.85)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "14px 32px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
        <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: "-0.3px" }}>MockMentor AI</span>
        <motion.button onClick={onBack}
          style={{ marginLeft: "auto", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 20, padding: "7px 18px", color: "#10b981", fontSize: 13, fontWeight: 600 }}
          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
          ← Back
        </motion.button>
        <motion.button onClick={onLogout}
          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 20, padding: "7px 18px", color: "#ef4444", fontSize: 13, fontWeight: 600 }}
          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
          Logout
        </motion.button>
      </div>

      <div style={{ padding: "32px 28px", maxWidth: 800, margin: "0 auto" }}>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, color: "#6b6b8a", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600, marginBottom: 6 }}>Account</div>
          <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px" }}>My Profile</h2>
        </motion.div>

        {/* User card */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          style={{ ...glass, padding: "22px 24px", marginBottom: 20, display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg,#7c3aed,#06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, flexShrink: 0, boxShadow: "0 8px 24px rgba(124,58,237,0.4)" }}>
            {profile.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.3px" }}>{profile.name}</div>
            <div style={{ fontSize: 13, color: "#6b6b8a", marginTop: 2 }}>{profile.email}</div>
          </div>
        </motion.div>

        {/* Stats grid */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
          {stats.map((item, i) => (
            <motion.div key={item.label} style={{ ...glass, padding: "18px 14px", textAlign: "center" }}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.06 }}
              whileHover={{ y: -3, borderColor: `${item.color}40` }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>{item.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: item.color, letterSpacing: "-0.5px" }}>{item.value}</div>
              <div style={{ fontSize: 10, color: "#6b6b8a", marginTop: 4, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5 }}>{item.label}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* Grade breakdown */}
        {Object.keys(profile.grades).length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            style={{ ...glass, padding: 22, marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: "#6b6b8a", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600, marginBottom: 16 }}>🎓 Grade Breakdown</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {Object.entries(profile.grades).map(([grade, count]) => (
                <motion.div key={grade} whileHover={{ scale: 1.05 }}
                  style={{ background: `${gradeColor(grade)}15`, border: `1px solid ${gradeColor(grade)}35`, color: gradeColor(grade), padding: "10px 20px", borderRadius: 12, fontWeight: 700, fontSize: 15 }}>
                  {grade} <span style={{ opacity: 0.7, fontSize: 13 }}>× {count}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Edit form */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          style={{ ...glass, padding: 24 }}>
          <div style={{ fontSize: 11, color: "#6b6b8a", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600, marginBottom: 20 }}>✏️ Edit Profile</div>
          <form onSubmit={handleUpdate} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { label: "Email (cannot change)", val: profile.email, disabled: true, key: null },
              { label: "Full Name", val: editName, disabled: false, key: "name" },
            ].map(f => (
              <div key={f.label}>
                <div style={{ fontSize: 11, color: "#6b6b8a", marginBottom: 6, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5 }}>{f.label}</div>
                <input style={{ ...inputStyle, opacity: f.disabled ? 0.4 : 1 }} value={f.val}
                  disabled={f.disabled}
                  onChange={f.key ? e => setEditName(e.target.value) : undefined}
                  onFocus={e => !f.disabled && (e.target.style.borderColor = "rgba(124,58,237,0.5)")}
                  onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.08)"} />
              </div>
            ))}

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 14, marginTop: 4 }}>
              <div style={{ fontSize: 11, color: "#6b6b8a", marginBottom: 14, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5 }}>Change Password</div>
              {[
                { label: "Current Password", val: currentPwd, set: setCurrentPwd, ph: "Enter current password" },
                { label: "New Password", val: newPwd, set: setNewPwd, ph: "Leave blank to keep same" },
              ].map(f => (
                <div key={f.label} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: "#6b6b8a", marginBottom: 6, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5 }}>{f.label}</div>
                  <input style={inputStyle} type="password" placeholder={f.ph} value={f.val} onChange={e => f.set(e.target.value)}
                    onFocus={e => e.target.style.borderColor = "rgba(124,58,237,0.5)"}
                    onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.08)"} />
                </div>
              ))}
            </div>

            {msg && (
              <div style={{ fontSize: 12, textAlign: "center", padding: "10px 14px", borderRadius: 8, background: msg.startsWith("✅") ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${msg.startsWith("✅") ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`, color: msg.startsWith("✅") ? "#10b981" : "#ef4444" }}>
                {msg}
              </div>
            )}

            <motion.button type="submit" disabled={loading}
              style={{ padding: "13px", fontSize: 14, fontWeight: 700, background: "linear-gradient(135deg,#7c3aed,#6d28d9)", color: "white", border: "none", borderRadius: 12, cursor: "pointer", opacity: loading ? 0.6 : 1, boxShadow: "0 4px 20px rgba(124,58,237,0.35)", letterSpacing: 0.3 }}
              whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
              {loading ? "Saving..." : "Save Changes →"}
            </motion.button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
