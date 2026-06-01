import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, getToken } from "../api/client.js";
import AuthLayout from "../components/AuthLayout.jsx";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState("verifying"); // verifying | success | error
  const [message, setMessage] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // guard React 18 StrictMode double-invoke
    ran.current = true;

    if (!token) {
      setStatus("error");
      setMessage("This verification link is missing its token.");
      return;
    }
    api("/api/auth/verify-email", { method: "POST", body: { token } })
      .then(() => setStatus("success"))
      .catch((err) => {
        setStatus("error");
        setMessage(err.message);
      });
  }, [token]);

  const loggedIn = Boolean(getToken());

  if (status === "verifying") {
    return (
      <AuthLayout eyebrow="Email verification" title="Verifying your email…" subtitle="One moment while we confirm your email address.">
        <div className="auth-status">
          <div className="auth-status-icon" style={{ background: "#e6f4f1", color: "#0f766e" }}>⋯</div>
        </div>
      </AuthLayout>
    );
  }

  if (status === "success") {
    return (
      <AuthLayout
        eyebrow="Email verification"
        title="Email verified"
        subtitle="Your email address is confirmed. You're all set."
      >
        <div className="auth-status">
          <div className="auth-status-icon" style={{ background: "#dcfce7", color: "#16a34a" }}>✓</div>
        </div>
        <Link className="auth-btn" to={loggedIn ? "/dashboard" : "/login"}>
          {loggedIn ? "Go to dashboard" : "Sign in"}
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Email verification"
      title="Verification failed"
      subtitle={message || "This verification link is invalid or has expired."}
    >
      <div className="auth-status">
        <div className="auth-status-icon" style={{ background: "#fee2e2", color: "#dc2626" }}>!</div>
      </div>
      <Link className="auth-btn" to={loggedIn ? "/dashboard" : "/login"}>
        {loggedIn ? "Back to dashboard" : "Back to sign in"}
      </Link>
    </AuthLayout>
  );
}
