import React, { useState, useEffect } from "react";

function ProfilePage({ token, onBack, onLogout, darkMode }) {
  const [profile, setProfile] = useState(null);
  const [editName, setEditName] = useState("");
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const t = {
    bg: darkMode
      ? "linear-gradient(135deg, #0a0a18 0%, #12103a 35%, #0d1f3c 65%, #0a1628 100%)"
      : "linear-gradient(135deg, #dfe9f3 0%, #e8d5f5 40%, #d4eaf7 100%)",
    card: darkMode ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.72)",
    cardBorder: darkMode ? "rgba(255,255,255,0.09)" : "rgba(180,180,220,0.35)",
    text: darkMode ? "#eeeeff" : "#12122e",
    subtext: darkMode ? "#8888aa" : "#5555aa",
    input: darkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.04)",
    navBg: darkMode ? "rgba(10,10,24,0.88)" : "rgba(255,255,255,0.88)",
    shadow: darkMode ? "0 8px 40px rgba(0,0,0,0.5)" : "0 8px 32px rgba(80,80,200,0.1)",
  };

  const glass = {
    background: t.card,
    border: `1px solid ${t.cardBorder}`,
    backdropFilter: "blur(20px)",
    borderRadius: 18,
    boxShadow: t.shadow,
  };

  const inputStyle = {
    width: "100%",
    padding: "11px 14px",
    borderRadius: 10,
    border: `1px solid ${t.cardBorder}`,
    background: t.input,
    color: t.text,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  };

  useEffect(() => {
    fetch("http://localhost:8000/profile", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => { setProfile(data); setEditName(data.name); });
  }, [token]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    const body = {};
    if (editName !== profile.name) body.name = editName;
    if (newPwd) { body.current_password = currentPwd; body.new_password = newPwd; }
    if (!Object.keys(body).length) { setMsg("No changes made."); setLoading(false); return; }
    try {
      const res = await fetch("http://localhost:8000/profile/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setMsg("❌ " + (data.detail || "Update failed")); }
      else {
        setMsg("✅ Profile updated!");
        setProfile(prev => ({ ...prev, name: editName }));
        setCurrentPwd(""); setNewPwd("");
      }
    } catch { setMsg("❌ Server error"); }
    setLoading(false);
  };

  const gradeColor = (g) => {
    if (g === "A") return "#4CAF50";
    if (g === "B") return "#2196F3";
    if (g === "C") return "#FF9800";
    return "#f44336";
  };

  if (!profile) return (
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", color: t.text, fontFamily: "'Inter','Segoe UI',Arial,sans-serif" }}>
      Loading...
    </div>
  );

  return (
    <div style={{ fontFamily: "'Inter','Segoe UI',Arial,sans-serif", background: t.bg, minHeight: "100vh", color: t.text }}>
      {/* Navbar */}
      <div style={{ background: t.navBg, backdropFilter: "blur(20px)", padding: "14px 32px", borderBottom: `1px solid ${t.cardBorder}`, display: "flex", alignItems: "center", gap: 14, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ width: 10, height: 10, background: "#4CAF50", borderRadius: "50%", boxShadow: "0 0 8px #4CAF50" }} />
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: t.text }}>MockMentor AI</h2>
        <button onClick={onBack} style={{ marginLeft: "auto", background: "rgba(76,175,80,0.15)", border: "1px solid rgba(76,175,80,0.4)", borderRadius: 20, padding: "6px 16px", cursor: "pointer", fontSize: 13, color: "#4CAF50", fontWeight: 500 }}>
          ← Back
        </button>
        <button onClick={onLogout} style={{ background: "rgba(244,67,54,0.15)", border: "1px solid rgba(244,67,54,0.4)", borderRadius: 20, padding: "6px 16px", cursor: "pointer", fontSize: 13, color: "#f44336", fontWeight: 500 }}>
          Logout
        </button>
      </div>

      <div style={{ padding: 30, maxWidth: 800, margin: "0 auto" }}>
        <h2 style={{ fontWeight: 800, fontSize: 22, marginBottom: 24, background: "linear-gradient(90deg,#43e97b,#4facfe)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          👤 My Profile
        </h2>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Total Sessions", value: profile.total_sessions, icon: "🎯", color: "#43e97b" },
            { label: "Avg Score", value: `${profile.avg_score}/100`, icon: "⭐", color: "#4facfe" },
            { label: "Best Score", value: profile.best_score, icon: "🏆", color: "#f7971e" },
            { label: "Worst Score", value: profile.worst_score, icon: "📉", color: "#f44336" },
          ].map(item => (
            <div key={item.label} style={{ ...glass, padding: "18px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{item.icon}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: item.color }}>{item.value}</div>
              <div style={{ fontSize: 11, color: t.subtext, marginTop: 4 }}>{item.label}</div>
            </div>
          ))}
        </div>

        {/* Grade breakdown */}
        {Object.keys(profile.grades).length > 0 && (
          <div style={{ ...glass, padding: 20, marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: t.subtext, marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 }}>🎓 Grade Breakdown</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {Object.entries(profile.grades).map(([grade, count]) => (
                <div key={grade} style={{ background: gradeColor(grade), color: "white", padding: "10px 20px", borderRadius: 12, fontWeight: 700, fontSize: 15 }}>
                  {grade}: {count}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Edit form */}
        <div style={{ ...glass, padding: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: t.subtext, marginBottom: 18, textTransform: "uppercase", letterSpacing: 1 }}>✏️ Edit Profile</div>
          <form onSubmit={handleUpdate} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: t.subtext, marginBottom: 6 }}>Email (cannot change)</div>
              <input style={{ ...inputStyle, opacity: 0.5 }} value={profile.email} disabled />
            </div>
            <div>
              <div style={{ fontSize: 12, color: t.subtext, marginBottom: 6 }}>Full Name</div>
              <input style={inputStyle} value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: t.subtext, marginBottom: 6 }}>Current Password</div>
              <input style={inputStyle} type="password" placeholder="Enter current password to change" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: t.subtext, marginBottom: 6 }}>New Password</div>
              <input style={inputStyle} type="password" placeholder="Leave blank to keep same" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
            </div>
            {msg && <div style={{ fontSize: 13, color: msg.startsWith("✅") ? "#43e97b" : "#f44336", textAlign: "center" }}>{msg}</div>}
            <button type="submit" disabled={loading} style={{ padding: "12px", fontSize: 15, fontWeight: 700, background: "linear-gradient(135deg,#4CAF50,#2e7d32)", color: "white", border: "none", borderRadius: 12, cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ProfilePage;
