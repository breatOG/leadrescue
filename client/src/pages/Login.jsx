import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setToken, setUser, PAYWALL_ENABLED } from "../api/client.js";
import AuthLayout from "../components/AuthLayout.jsx";
import PasswordInput from "../components/PasswordInput.jsx";

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api("/api/auth/login", { method: "POST", body: form });
      setToken(data.token);
      setUser(data.user);
      navigate(!PAYWALL_ENABLED || data.user?.subscriptionStatus === "active" ? "/dashboard" : "/subscribe");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Sign in to LeadRescue"
      subtitle="Enter your details to get back to your dashboard."
      footer={<>Don't have an account? <Link className="auth-link" to="/register">Sign up free</Link></>}
    >
      <form className="auth-form" onSubmit={submit}>
        <label className="auth-label">
          Phone number or email
          <input
            className="auth-input"
            type="text"
            value={form.identifier}
            onChange={(e) => setForm({ ...form, identifier: e.target.value })}
            placeholder="you@example.com"
            autoComplete="username"
            required
          />
        </label>
        <label className="auth-label">
          Password
          <PasswordInput
            className="auth-input"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            autoComplete="current-password"
            required
          />
        </label>
        <div className="auth-forgot">
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        {error && <div className="auth-error">{error}</div>}
        <button className="auth-btn" type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthLayout>
  );
}
