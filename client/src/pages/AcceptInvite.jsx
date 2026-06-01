import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle, Loader, XCircle } from "lucide-react";
import { api, setToken, setUser } from "../api/client.js";

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");

  const [invite, setInvite] = useState(null);       // { email, name, businessName }
  const [status, setStatus] = useState("loading");  // loading | ready | invalid | submitting | done
  const [form, setForm] = useState({ name: "", password: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) { setStatus("invalid"); return; }
    api(`/api/invites/validate/${token}`)
      .then((data) => {
        setInvite(data);
        setForm((f) => ({ ...f, name: data.name || "" }));
        setStatus("ready");
      })
      .catch(() => setStatus("invalid"));
  }, [token]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setStatus("submitting");
    try {
      const data = await api("/api/invites/accept", {
        method: "POST",
        body: { token, name: form.name, password: form.password }
      });
      setToken(data.token);
      setUser(data.user);
      setStatus("done");
      setTimeout(() => navigate("/dashboard"), 1800);
    } catch (err) {
      setError(err.message);
      setStatus("ready");
    }
  }

  if (status === "loading") return (
    <div style={page}>
      <Loader size={32} style={{ color: "#0f766e", animation: "spin-slow 1s linear infinite" }} />
      <p style={{ color: "#64748b", marginTop: 16 }}>Verifying your invitation…</p>
    </div>
  );

  if (status === "invalid") return (
    <div style={page}>
      <XCircle size={48} style={{ color: "#ef4444" }} />
      <h2 style={{ marginTop: 16, marginBottom: 8 }}>Invitation not found</h2>
      <p style={{ color: "#64748b", marginBottom: 28 }}>This invitation link is invalid or has already expired. Ask your team owner to send a new one.</p>
      <Link to="/login" style={btnStyle}>Go to login</Link>
    </div>
  );

  if (status === "done") return (
    <div style={page}>
      <CheckCircle size={48} style={{ color: "#16a34a" }} />
      <h2 style={{ marginTop: 16, marginBottom: 8 }}>You're in!</h2>
      <p style={{ color: "#64748b" }}>Taking you to the dashboard…</p>
    </div>
  );

  return (
    <div style={{ ...page, alignItems: "flex-start" }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "linear-gradient(135deg,#0f766e,#115e59)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", fontSize: "0.82rem" }}>LR</div>
          <span style={{ fontWeight: 850, fontSize: "1.05rem" }}>LeadRescue</span>
        </div>

        <p style={{ margin: "0 0 6px", fontSize: "0.8rem", fontWeight: 700, color: "#0f766e", textTransform: "uppercase", letterSpacing: "0.06em" }}>Team invitation</p>
        <h1 style={{ margin: "0 0 8px", fontSize: "1.8rem", fontWeight: 900, letterSpacing: "-0.02em" }}>
          Join {invite?.businessName}
        </h1>
        <p style={{ margin: "0 0 36px", color: "#64748b", fontSize: "0.95rem" }}>
          You've been invited to join <strong>{invite?.businessName}</strong> on LeadRescue. Set up your account below.
        </p>

        <form onSubmit={submit} style={{ display: "grid", gap: 18 }}>
          <label className="auth-label">
            Your name
            <input className="auth-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" required />
          </label>
          <label className="auth-label">
            Email
            <input className="auth-input" value={invite?.email || ""} readOnly style={{ background: "#f1f5f9", color: "#64748b" }} />
          </label>
          <label className="auth-label">
            Create a password <span style={{ fontWeight: 500, color: "#94a3b8", fontSize: "0.8rem" }}>(min. 8 characters)</span>
            <input className="auth-input" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required minLength={8} autoComplete="new-password" />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button className="auth-btn" type="submit" disabled={status === "submitting"}>
            {status === "submitting" ? "Setting up your account…" : "Accept invitation & get started"}
          </button>
        </form>

        <p style={{ marginTop: 20, textAlign: "center", color: "#94a3b8", fontSize: "0.85rem" }}>
          Already have an account? <Link to="/login" style={{ color: "#0f766e", fontWeight: 700 }}>Log in</Link>
        </p>
      </div>
    </div>
  );
}

const page = { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px", fontFamily: "Inter, system-ui, sans-serif", background: "#f8fafb" };
const btnStyle = { display: "inline-block", background: "#0f766e", color: "#fff", fontWeight: 700, padding: "12px 24px", borderRadius: 10, textDecoration: "none", fontSize: "0.95rem" };
