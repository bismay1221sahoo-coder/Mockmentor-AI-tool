import React, { useState } from "react";

const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What is your mother's maiden name?",
  "What city were you born in?",
  "What was the name of your first school?",
  "What is your favorite childhood movie?",
];

function AuthPage({ onLogin, darkMode }) {
  const [mode, setMode] = useState("login"); // login | signup | forgot | reset
  const [form, setForm] = useState({ name: "", email: "", password: "", security_question: SECURITY_QUESTIONS[0], security_answer: "" });
  const [forgot, setForgot] = useState({ email: "", security_question: "", security_answer: "", new_password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const t = {
    bg: darkMode
      ? "linear-gradient(135deg, #0a0a18 0%, #12103a 35%, #0d1f3c 65%, #0a1628 100%)"
      : "linear-gradient(135deg, #dfe9f3 0%, #e8d5f5 40%, #d4eaf7 100%)",
    card: darkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.85)",
    cardBorder: darkMode ? "rgba(255,255,255,0.1)" : "rgba(180,180,220,0.35)",
    text: darkMode ? "#eeeeff" : "#12122e",
    subtext: darkMode ? "#8888aa" : "#5555aa",
    input: darkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.04)",
  };

  const inputStyle = {
    width: "100%", padding: "12px 16px", borderRadius: 10,
    border: `1px solid ${t.cardBorder}`, background: t.input,
    color: t.text, fontSize: 14, outline: "none", boxSizing: "border-box",
  };

  const selectStyle = { ...inputStyle, cursor: "pointer" };

  const handleLogin = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    const formData = new URLSearchParams();
    formData.append("username", form.email);
    formData.append("password", form.password);
    try {
      const res = await fetch("http://localhost:8000/login", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Login failed"); setLoading(false); return; }
      localStorage.setItem("token", data.access_token);
      const meRes = await fetch("http://localhost:8000/me", { headers: { Authorization: `Bearer ${data.access_token}` } });
      const me = await meRes.json();
      onLogin(data.access_token, me);
    } catch { setError("Server error. Is backend running?"); }
    setLoading(false);
  };

  const handleSignup = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Registration failed"); setLoading(false); return; }
      setMode("login");
      setError("✅ Registered! Please login.");
    } catch { setError("Server error. Is backend running?"); }
    setLoading(false);
  };

  const handleGetQuestion = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/security-question?email=${forgot.email}`);
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Email not found"); setLoading(false); return; }
      setForgot(prev => ({ ...prev, security_question: data.security_question }));
      setMode("reset");
    } catch { setError("Server error."); }
    setLoading(false);
  };

  const handleReset = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgot.email, security_answer: forgot.security_answer, new_password: forgot.new_password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Reset failed"); setLoading(false); return; }
      setMode("login");
      setError("✅ Password reset! Please login.");
    } catch { setError("Server error."); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter','Segoe UI',Arial,sans-serif" }}>
      <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, backdropFilter: "blur(20px)", borderRadius: 20, padding: "40px 36px", width: "100%", maxWidth: 420, boxShadow: "0 8px 40px rgba(0,0,0,0.3)" }}>

        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, background: "linear-gradient(90deg,#43e97b,#4facfe)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>MockMentor AI</h2>
          <p style={{ margin: "6px 0 0", color: t.subtext, fontSize: 13 }}>
            {mode === "login" && "Welcome back!"}
            {mode === "signup" && "Create your account"}
            {mode === "forgot" && "Forgot Password"}
            {mode === "reset" && "Reset Password"}
          </p>
        </div>

        {/* Login */}
        {mode === "login" && (
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <input style={inputStyle} placeholder="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
            <input style={inputStyle} placeholder="Password" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
            {error && <div style={{ fontSize: 13, color: error.startsWith("✅") ? "#43e97b" : "#f44336", textAlign: "center" }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ padding: "13px", fontSize: 15, fontWeight: 700, background: "linear-gradient(135deg,#4CAF50,#2e7d32)", color: "white", border: "none", borderRadius: 12, cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Please wait..." : "Login"}
            </button>
            <p style={{ textAlign: "center", margin: 0, fontSize: 13, color: t.subtext }}>
              <span onClick={() => { setMode("forgot"); setError(""); }} style={{ color: "#4facfe", cursor: "pointer", fontWeight: 600 }}>Forgot Password?</span>
            </p>
          </form>
        )}

        {/* Signup */}
        {mode === "signup" && (
          <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <input style={inputStyle} placeholder="Full Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            <input style={inputStyle} placeholder="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
            <input style={inputStyle} placeholder="Password" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
            <select style={selectStyle} value={form.security_question} onChange={e => setForm({ ...form, security_question: e.target.value })}>
              {SECURITY_QUESTIONS.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
            <input style={inputStyle} placeholder="Your answer" value={form.security_answer} onChange={e => setForm({ ...form, security_answer: e.target.value })} required />
            {error && <div style={{ fontSize: 13, color: error.startsWith("✅") ? "#43e97b" : "#f44336", textAlign: "center" }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ padding: "13px", fontSize: 15, fontWeight: 700, background: "linear-gradient(135deg,#4CAF50,#2e7d32)", color: "white", border: "none", borderRadius: 12, cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Please wait..." : "Sign Up"}
            </button>
          </form>
        )}

        {/* Forgot - enter email */}
        {mode === "forgot" && (
          <form onSubmit={handleGetQuestion} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <input style={inputStyle} placeholder="Enter your email" type="email" value={forgot.email} onChange={e => setForgot({ ...forgot, email: e.target.value })} required />
            {error && <div style={{ fontSize: 13, color: "#f44336", textAlign: "center" }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ padding: "13px", fontSize: 15, fontWeight: 700, background: "linear-gradient(135deg,#4facfe,#00f2fe)", color: "white", border: "none", borderRadius: 12, cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Checking..." : "Continue"}
            </button>
          </form>
        )}

        {/* Reset - answer question + new password */}
        {mode === "reset" && (
          <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "rgba(79,172,254,0.1)", border: "1px solid rgba(79,172,254,0.3)", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: t.subtext }}>
              🔐 {forgot.security_question}
            </div>
            <input style={inputStyle} placeholder="Your answer" value={forgot.security_answer} onChange={e => setForgot({ ...forgot, security_answer: e.target.value })} required />
            <input style={inputStyle} placeholder="New Password" type="password" value={forgot.new_password} onChange={e => setForgot({ ...forgot, new_password: e.target.value })} required />
            {error && <div style={{ fontSize: 13, color: "#f44336", textAlign: "center" }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ padding: "13px", fontSize: 15, fontWeight: 700, background: "linear-gradient(135deg,#4CAF50,#2e7d32)", color: "white", border: "none", borderRadius: 12, cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Resetting..." : "Reset Password"}
            </button>
          </form>
        )}

        {/* Bottom toggle */}
        <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: t.subtext }}>
          {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          <span onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
            style={{ color: "#4facfe", cursor: "pointer", fontWeight: 600 }}>
            {mode === "login" ? "Sign Up" : "Login"}
          </span>
        </p>
      </div>
    </div>
  );
}

export default AuthPage;
