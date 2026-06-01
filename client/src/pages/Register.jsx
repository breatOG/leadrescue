import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { api, setToken, setUser } from "../api/client.js";
import AuthLayout from "../components/AuthLayout.jsx";
import PhoneInput, { phoneDigits } from "../components/PhoneInput.jsx";
import PasswordInput from "../components/PasswordInput.jsx";

export default function Register() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const plan = params.get("plan") || "";

  const [form, setForm] = useState({ name: "", businessName: "", email: "", phone: "", password: "" });
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
      const data = await api("/api/auth/register", {
        method: "POST",
        body: { ...form, phone: phoneDigits(form.phone) }
      });
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
    <AuthLayout
      eyebrow="Get started"
      title="Create your account"
      subtitle="Start capturing leads in minutes. No credit card until you choose a plan."
      footer={<>Already have an account? <Link className="auth-link" to="/login">Sign in</Link></>}
    >
      <form className="auth-form" onSubmit={submit}>
        <label className="auth-label">
          Full name
          <input className="auth-input" value={form.name} onChange={set("name")} placeholder="John Smith" required autoComplete="name" />
        </label>
        <label className="auth-label">
          Business name
          <input className="auth-input" value={form.businessName} onChange={set("businessName")} placeholder="Smith Plumbing Co" required autoComplete="organization" />
        </label>
        <label className="auth-label">
          Email address
          <input className="auth-input" type="email" value={form.email} onChange={set("email")} placeholder="you@example.com" required autoComplete="email" />
        </label>
        <label className="auth-label">
          Phone number
          <PhoneInput className="auth-input" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} required />
        </label>
        <label className="auth-label">
          Password <span className="auth-hint">(min. 8 characters)</span>
          <PasswordInput className="auth-input" value={form.password} onChange={set("password")} required autoComplete="new-password" minLength={8} />
        </label>

        {error && <div className="auth-error">{error}</div>}

        <button className="auth-btn" type="submit" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </button>
        <p style={{ fontSize: "0.78rem", color: "#9ca3af", textAlign: "center", margin: "8px 0 0", lineHeight: 1.5 }}>
          By creating an account you agree to our{" "}
          <Link to="/terms" style={{ color: "#2563eb" }}>Terms of Service</Link>
          {" "}and{" "}
          <Link to="/privacy" style={{ color: "#2563eb" }}>Privacy Policy</Link>.
        </p>
      </form>
    </AuthLayout>
  );
}
