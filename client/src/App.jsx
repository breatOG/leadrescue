import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import { api, getToken, getUser, isSubscribed, setUser } from "./api/client.js";
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
import CustomInvoice from "./pages/CustomInvoice.jsx";

// Redirects logged-in, subscribed users to the app; unsubscribed to /subscribe
function ProtectedRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [ready, setReady] = useState(false);

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

    // Re-fetch user to get latest subscription status
    api("/api/auth/me")
      .then((data) => {
        setUser(data.user);
        if (data.user.subscriptionStatus !== "active") {
          navigate("/subscribe", { replace: true });
        } else {
          setReady(true);
        }
      })
      .catch(() => {
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
      <Route path="/signup" element={<Navigate to="/register" replace />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/leads/:id" element={<LeadDetail />} />
        <Route path="/invoice" element={<CustomInvoice />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
