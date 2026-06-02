import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import { api, getToken, getUser, isSubscribed, setUser, setToken, PAYWALL_ENABLED } from "./api/client.js";
import { Layout } from "./components/Layout.jsx";
import Landing from "./pages/Pricing.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import VerifyEmail from "./pages/VerifyEmail.jsx";
import Subscribe from "./pages/Subscribe.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Leads from "./pages/Leads.jsx";
import LeadDetail from "./pages/LeadDetail.jsx";
import Settings from "./pages/Settings.jsx";
import CalendarPage from "./pages/Calendar.jsx";
import SmsSetup from "./pages/SmsSetup.jsx";
import Privacy from "./pages/Privacy.jsx";
import Terms from "./pages/Terms.jsx";
import AcceptInvite from "./pages/AcceptInvite.jsx";
import CustomInvoice from "./pages/CustomInvoice.jsx";

// Redirects logged-in, subscribed users to the app; unsubscribed to /subscribe
function ProtectedRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Render the shell instantly if we already have a cached session — no blocking
  // round-trip before the dashboard mounts. We still validate in the background.
  const [ready, setReady] = useState(() => Boolean(getToken() && getUser()));

  useEffect(() => {
    if (!getToken()) {
      navigate("/login", { replace: true });
      return;
    }

    const sessionId = searchParams.get("session_id");
    const sub = searchParams.get("sub");

    // Coming back from Stripe checkout — verify the session
    if (sessionId && sub === "success") {
      api("/api/payments/verify-session", { method: "POST", body: { sessionId } })
        .then((data) => {
          setUser(data.user);
          setReady(true);
        })
        .catch(() => setReady(true));
      return;
    }

    // Validate the session in the background and refresh the cached user.
    api("/api/auth/me")
      .then((data) => {
        setUser(data.user);
        if (PAYWALL_ENABLED && data.user.subscriptionStatus !== "active") {
          navigate("/", { replace: true });
        } else {
          setReady(true);
        }
      })
      .catch(() => {
        setToken(null);
        setUser(null);
        navigate("/login", { replace: true });
      });
  }, []);

  if (!ready) return null;
  return <Layout />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/subscribe" element={<Subscribe />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/signup" element={<Navigate to="/register" replace />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/leads/:id" element={<LeadDetail />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/sms-setup" element={<SmsSetup />} />
        <Route path="/invoice" element={<CustomInvoice />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
