import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What is your mother's maiden name?",
  "What city were you born in?",
  "What was the name of your first school?",
  "What is your favorite childhood movie?",
];

const BASE = "http://localhost:8000";

const s = {
  page: {
    minHeight: "100vh",
    background: "#050508",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Inter', sans-serif",
    position: "relative",
    overflow: "hidden",
  },
  orb1: {
    position: "fixed", top: "-20%", left: "-10%",
    width: 600, height: 600, borderRadius: "50%",
    background: "radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  orb2: {
    position: "fixed", bottom: "-20%", right: "-10%",
    width: 500, height: 500, borderRadius: "50%",
    background: "radial-gradient(circle, rgba(6,182,212,0.1) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  card: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(24px)",
    borderRadius: 24,
    padding: "44px 40px",
    width: "100%",
    maxWidth: 420,
    position: "relative",
    zIndex: 1,
    boxShadow: "0 0 0 1px rgba(255,255,255,0.04), 0 32px 64px rgba(0,0,0,0.6)",
  },
  logo: {
    textAlign: "center",
    marginBottom: 32,
  },
  logoIcon: {
    width: 52, height: 52,
    background: "linear-gradient(135deg, #7c3aed, #06b6d4)",
    borderRadius: 16,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 24, margin: "0 auto 14px",
    boxShadow: "0 8px 32px rgba(124,58,237,0.4)",
  },
  title: {
    fontSize: 22, fontWeight: 800, color: "#f0f0ff",
    letterSpacing: "-0.5px", marginBottom: 4,
  },
  subtitle: { fontSize: 13, color: "#6b6b8a", fontWeight: 400 },
  tabs: {
    display: "flex", background: "rgba(255,255,255,0.04)",
    borderRadius: 12, padding: 4, marginBottom: 28,
    border: "1px solid rgba(255,255,255,0.06)",
  },
  tab: (active) => ({
    flex: 1, padding: "9px 0", borderRadius: 9, border: "none",
    fontSize: 13, fontWeight: 600, cursor: "pointer",
    transition: "all 0.2s",
    background: active ? "rgba(124,58,237,0.25)" : "transparent",
    color: active ? "#a78bfa" : "#6b6b8a",
    boxShadow: active ? "0 0 0 1px rgba(124,58,237,0.3)" : "none",
  }),
  field: { marginBottom: 14 },
  label: { fontSize: 11, color: "#6b6b8a", fontWeight: 500, marginBottom: 6, display: "block", letterSpacing: 0.5, textTransform: "uppercase" },
  input: {
    width: "100%", padding: "12px 14px", borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "#f0f0ff", fontSize: 14, outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
    boxSizing: "border-box",
  },
  select: {
    width: "100%", padding: "12px 14px", borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(20,20,35,0.9)",
    color: "#f0f0ff", fontSize: 14, outline: "none",
    boxSizing: "border-box", cursor: "pointer",
  },
  btn: {
    width: "100%", padding: "13px", fontSize: 14, fontWeight: 700,
    background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
    color: "white", border: "none", borderRadius: 12, cursor: "pointer",
    marginTop: 6, letterSpacing: 0.3,
    boxShadow: "0 4px 24px rgba(124,58,237,0.4)",
    transition: "opacity 0.2s, transform 0.15s",
  },
  btnSecondary: {
    width: "100%", padding: "13px", fontSize: 14, fontWeight: 700,
    background: "linear-gradient(135deg, #0891b2, #06b6d4)",
    color: "white", border: "none", borderRadius: 12, cursor: "pointer",
    marginTop: 6, letterSpacing: 0.3,
    boxShadow: "0 4px 24px rgba(6,182,212,0.3)",
    transition: "opacity 0.2s, transform 0.15s",
  },
  error: (ok) => ({
    fontSize: 12, textAlign: "center", padding: "10px 14px",
    borderRadius: 8, marginBottom: 4,
    background: ok ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
    border: `1px solid ${ok ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
    color: ok ? "#10b981" : "#ef4444",
  }),
  link: { color: "#7c3aed", cursor: "pointer", fontWeight: 600, fontSize: 13 },
  divider: { textAlign: "center", fontSize: 12, color: "#6b6b8a", margin: "16px 0" },
  securityBox: {
    background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.2)",
    borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#67e8f9",
    marginBottom: 14,
  },
};

export default function AuthPage({ onLogin, darkMode }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", security_question: SECURITY_QUESTIONS[0], security_answer: "" });
  const [forgot, setForgot] = useState({ email: "", security_question: "", security_answer: "", new_password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isOk = error.startsWith("✅");

  const handleLogin = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    const fd = new URLSearchParams();
    fd.append("username", form.email); fd.append("password", form.password);
    try {
      const res = await fetch(`${BASE}/login`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Login failed"); setLoading(false); return; }
      localStorage.setItem("token", data.access_token);
      const me = await (await fetch(`${BASE}/me`, { headers: { Authorization: `Bearer ${data.access_token}` } })).json();
      onLogin(data.access_token, me);
    } catch { setError("Server error. Is backend running?"); }
    setLoading(false);
  };

  const handleSignup = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const res = await fetch(`${BASE}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Registration failed"); setLoading(false); return; }
      setMode("login"); setError("✅ Registered! Please login.");
    } catch { setError("Server error."); }
    setLoading(false);
  };

  const handleGetQuestion = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const res = await fetch(`${BASE}/security-question?email=${forgot.email}`);
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Email not found"); setLoading(false); return; }
      setForgot(p => ({ ...p, security_question: data.security_question }));
      setMode("reset");
    } catch { setError("Server error."); }
    setLoading(false);
  };

  const handleReset = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const res = await fetch(`${BASE}/forgot-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: forgot.email, security_answer: forgot.security_answer, new_password: forgot.new_password }) });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Reset failed"); setLoading(false); return; }
      setMode("login"); setError("✅ Password reset! Please login.");
    } catch { setError("Server error."); }
    setLoading(false);
  };

  return (
    <div style={s.page}>
      <div style={s.orb1} />
      <div style={s.orb2} />

      <motion.div style={s.card} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
        <div style={s.logo}>
          <motion.div style={s.logoIcon} whileHover={{ scale: 1.05 }}>🎯</motion.div>
          <div style={s.title}>MockMentor AI</div>
          <div style={s.subtitle}>
            {mode === "login" && "Welcome back — let's practice"}
            {mode === "signup" && "Create your account"}
            {mode === "forgot" && "Recover your account"}
            {mode === "reset" && "Set a new password"}
          </div>
        </div>

        {(mode === "login" || mode === "signup") && (
          <div style={s.tabs}>
            <button style={s.tab(mode === "login")} onClick={() => { setMode("login"); setError(""); }}>Login</button>
            <button style={s.tab(mode === "signup")} onClick={() => { setMode("signup"); setError(""); }}>Sign Up</button>
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div key={mode} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }}>

            {mode === "login" && (
              <form onSubmit={handleLogin}>
                <div style={s.field}>
                  <label style={s.label}>Email</label>
                  <input style={s.input} type="email" placeholder="you@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required
                    onFocus={e => e.target.style.borderColor = "rgba(124,58,237,0.5)"}
                    onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.08)"} />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Password</label>
                  <input style={s.input} type="password" placeholder="••••••••" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required
                    onFocus={e => e.target.style.borderColor = "rgba(124,58,237,0.5)"}
                    onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.08)"} />
                </div>
                {error && <div style={s.error(isOk)}>{error}</div>}
                <motion.button type="submit" style={{ ...s.btn, opacity: loading ? 0.6 : 1 }} disabled={loading} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                  {loading ? "Signing in..." : "Sign In →"}
                </motion.button>
                <div style={s.divider}>
                  <span style={s.link} onClick={() => { setMode("forgot"); setError(""); }}>Forgot password?</span>
                </div>
              </form>
            )}

            {mode === "signup" && (
              <form onSubmit={handleSignup}>
                {[
                  { label: "Full Name", key: "name", type: "text", ph: "John Doe" },
                  { label: "Email", key: "email", type: "email", ph: "you@example.com" },
                  { label: "Password", key: "password", type: "password", ph: "••••••••" },
                ].map(f => (
                  <div key={f.key} style={s.field}>
                    <label style={s.label}>{f.label}</label>
                    <input style={s.input} type={f.type} placeholder={f.ph} value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} required
                      onFocus={e => e.target.style.borderColor = "rgba(124,58,237,0.5)"}
                      onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.08)"} />
                  </div>
                ))}
                <div style={s.field}>
                  <label style={s.label}>Security Question</label>
                  <select style={s.select} value={form.security_question} onChange={e => setForm({ ...form, security_question: e.target.value })}>
                    {SECURITY_QUESTIONS.map(q => <option key={q} value={q}>{q}</option>)}
                  </select>
                </div>
                <div style={s.field}>
                  <label style={s.label}>Your Answer</label>
                  <input style={s.input} placeholder="Answer" value={form.security_answer} onChange={e => setForm({ ...form, security_answer: e.target.value })} required
                    onFocus={e => e.target.style.borderColor = "rgba(124,58,237,0.5)"}
                    onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.08)"} />
                </div>
                {error && <div style={s.error(isOk)}>{error}</div>}
                <motion.button type="submit" style={{ ...s.btn, opacity: loading ? 0.6 : 1 }} disabled={loading} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                  {loading ? "Creating account..." : "Create Account →"}
                </motion.button>
              </form>
            )}

            {mode === "forgot" && (
              <form onSubmit={handleGetQuestion}>
                <div style={{ fontSize: 13, color: "#6b6b8a", marginBottom: 20, lineHeight: 1.6 }}>
                  Enter your registered email and we'll show your security question.
                </div>
                <div style={s.field}>
                  <label style={s.label}>Email</label>
                  <input style={s.input} type="email" placeholder="you@example.com" value={forgot.email} onChange={e => setForgot({ ...forgot, email: e.target.value })} required
                    onFocus={e => e.target.style.borderColor = "rgba(6,182,212,0.5)"}
                    onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.08)"} />
                </div>
                {error && <div style={s.error(isOk)}>{error}</div>}
                <motion.button type="submit" style={{ ...s.btnSecondary, opacity: loading ? 0.6 : 1 }} disabled={loading} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                  {loading ? "Checking..." : "Continue →"}
                </motion.button>
                <div style={s.divider}>
                  <span style={s.link} onClick={() => { setMode("login"); setError(""); }}>← Back to login</span>
                </div>
              </form>
            )}

            {mode === "reset" && (
              <form onSubmit={handleReset}>
                <div style={s.securityBox}>🔐 {forgot.security_question}</div>
                <div style={s.field}>
                  <label style={s.label}>Your Answer</label>
                  <input style={s.input} placeholder="Answer" value={forgot.security_answer} onChange={e => setForgot({ ...forgot, security_answer: e.target.value })} required
                    onFocus={e => e.target.style.borderColor = "rgba(124,58,237,0.5)"}
                    onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.08)"} />
                </div>
                <div style={s.field}>
                  <label style={s.label}>New Password</label>
                  <input style={s.input} type="password" placeholder="••••••••" value={forgot.new_password} onChange={e => setForgot({ ...forgot, new_password: e.target.value })} required
                    onFocus={e => e.target.style.borderColor = "rgba(124,58,237,0.5)"}
                    onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.08)"} />
                </div>
                {error && <div style={s.error(isOk)}>{error}</div>}
                <motion.button type="submit" style={{ ...s.btn, opacity: loading ? 0.6 : 1 }} disabled={loading} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                  {loading ? "Resetting..." : "Reset Password →"}
                </motion.button>
              </form>
            )}

          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
