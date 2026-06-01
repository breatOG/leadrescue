import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, setToken, setUser } from "../api/client.js";

export default function Register() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const plan = params.get("plan") || "";

  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api("/api/auth/register", { method: "POST", body: form });
      setToken(data.token);
      setUser(data.user);
      navigate(plan ? `/subscribe?plan=${plan}` : "/subscribe");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <Link to="/" style={s.brand}>
          <div style={s.logoMark}>LR</div>
          <span style={s.logoText}>LeadRescue</span>
        </Link>

        <h1 style={s.title}>Create your account</h1>
        <p style={s.sub}>Start capturing leads in minutes. No credit card until you choose a plan.</p>

        <form onSubmit={submit} style={s.form}>
          <label style={s.label}>
            Full name
            <input style={s.input} value={form.name} onChange={set("name")} placeholder="John Smith" required autoComplete="name" />
          </label>
          <label style={s.label}>
            Email address
            <input style={s.input} type="email" value={form.email} onChange={set("email")} placeholder="you@example.com" required autoComplete="email" />
          </label>
          <label style={s.label}>
            Password <span style={s.hint}>(min. 8 characters)</span>
            <input style={s.input} type="password" value={form.password} onChange={set("password")} required autoComplete="new-password" minLength={8} />
          </label>

          {error && <div style={s.error}>{error}</div>}

          <button type="submit" style={s.btn} disabled={loading}>
            {loading ? "Creating account…" : "Create account →"}
          </button>
        </form>

        <p style={s.footer}>
          Already have an account?{" "}
          <Link to="/login" style={s.link}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}

const BLUE = "#2563eb";

const s = {
  page: { minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" },
  card: { background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 20, padding: "2.5rem", width: "100%", maxWidth: 420, boxShadow: "0 4px 24px rgba(0,0,0,0.06)" },
  brand: { display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none", marginBottom: "2rem" },
  logoMark: { width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${BLUE}, #1e40af)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: "0.8rem" },
  logoText: { fontWeight: 800, fontSize: "1.1rem", color: "#0f172a" },
  title: { fontSize: "1.5rem", fontWeight: 800, margin: "0 0 0.4rem", letterSpacing: "-0.5px" },
  sub: { color: "#64748b", fontSize: "0.875rem", margin: "0 0 2rem", lineHeight: 1.5 },
  form: { display: "flex", flexDirection: "column", gap: "1.25rem" },
  label: { display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "0.875rem", fontWeight: 600, color: "#374151" },
  hint: { fontWeight: 400, color: "#94a3b8", fontSize: "0.8rem" },
  input: { border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "0.7rem 0.9rem", fontSize: "0.95rem", outline: "none", fontFamily: "inherit", color: "#0f172a", width: "100%", boxSizing: "border-box" },
  error: { background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "0.75rem 1rem", color: "#dc2626", fontSize: "0.875rem" },
  btn: { background: BLUE, color: "#fff", border: "none", borderRadius: 10, padding: "0.875rem", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer", marginTop: "0.25rem" },
  footer: { textAlign: "center", marginTop: "1.5rem", fontSize: "0.875rem", color: "#64748b" },
  link: { color: BLUE, fontWeight: 600, textDecoration: "none" },
};
