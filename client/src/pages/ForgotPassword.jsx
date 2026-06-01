import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import AuthLayout from "../components/AuthLayout.jsx";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/api/auth/forgot-password", { method: "POST", body: { email } });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <AuthLayout
        eyebrow="Check your inbox"
        title="Reset link sent"
        subtitle={<>If an account exists for <strong>{email}</strong>, we've emailed a link to reset your password. It expires in 1 hour.</>}
        footer={<>Back to <Link className="auth-link" to="/login">Sign in</Link></>}
      >
        <Link className="auth-btn" to="/login">Return to sign in</Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Account recovery"
      title="Reset your password"
      subtitle="Enter the email on your account and we'll send you a reset link."
      footer={<>Remembered it? <Link className="auth-link" to="/login">Sign in</Link></>}
    >
      <form className="auth-form" onSubmit={submit}>
        <label className="auth-label">
          Email address
          <input className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" />
        </label>
        {error && <div className="auth-error">{error}</div>}
        <button className="auth-btn" type="submit" disabled={loading}>
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>
    </AuthLayout>
  );
}
