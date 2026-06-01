import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client.js";
import AuthLayout from "../components/AuthLayout.jsx";
import PasswordInput from "../components/PasswordInput.jsx";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await api("/api/auth/reset-password", { method: "POST", body: { token, password } });
      setDone(true);
      setTimeout(() => navigate("/login"), 1800);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout
        eyebrow="Account recovery"
        title="Invalid reset link"
        subtitle="This password reset link is missing its token. Request a fresh one."
        footer={<>Back to <Link className="auth-link" to="/login">Sign in</Link></>}
      >
        <Link className="auth-btn" to="/forgot-password">Request a new link</Link>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout
        eyebrow="All set"
        title="Password updated"
        subtitle="Your password has been changed. Redirecting you to sign in…"
        footer={<>Didn't redirect? <Link className="auth-link" to="/login">Sign in</Link></>}
      >
        <Link className="auth-btn" to="/login">Sign in now</Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Account recovery"
      title="Choose a new password"
      subtitle="Enter and confirm your new password below."
    >
      <form className="auth-form" onSubmit={submit}>
        <label className="auth-label">
          New password <span className="auth-hint">(min. 8 characters)</span>
          <PasswordInput className="auth-input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
        </label>
        <label className="auth-label">
          Confirm password
          <PasswordInput className="auth-input" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password" />
        </label>
        {error && <div className="auth-error">{error}</div>}
        <button className="auth-btn" type="submit" disabled={loading}>
          {loading ? "Saving…" : "Reset password"}
        </button>
      </form>
    </AuthLayout>
  );
}
