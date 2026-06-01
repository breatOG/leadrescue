import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { CalendarDays, CalendarRange, LayoutDashboard, LogOut, Mail, Settings, Table2, X } from "lucide-react";
import { api, getUser, setToken, setUser } from "../api/client.js";

function VerifyEmailBanner() {
  const user = getUser();
  const [dismissed, setDismissed] = useState(false);
  const [state, setState] = useState("idle"); // idle | sending | sent | error

  if (!user || user.emailVerified || dismissed) return null;

  async function resend() {
    setState("sending");
    try {
      await api("/api/auth/resend-verification", { method: "POST" });
      setState("sent");
    } catch {
      setState("error");
    }
  }

  return (
    <div style={banner.wrap}>
      <Mail size={18} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>
        {state === "sent"
          ? <>Verification email sent to <strong>{user.email}</strong>. Check your inbox.</>
          : <>Please verify your email <strong>{user.email}</strong> to secure your account.</>}
      </span>
      {state !== "sent" && (
        <button style={banner.action} onClick={resend} disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : state === "error" ? "Try again" : "Resend email"}
        </button>
      )}
      <button style={banner.close} onClick={() => setDismissed(true)} aria-label="Dismiss"><X size={16} /></button>
    </div>
  );
}

const banner = {
  wrap: { display: "flex", alignItems: "center", gap: "0.75rem", background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", padding: "0.65rem 1rem", borderRadius: 10, margin: "0 0 1.25rem", fontSize: "0.875rem" },
  action: { background: "#92400e", color: "#fff", border: "none", borderRadius: 8, padding: "0.4rem 0.75rem", fontWeight: 600, fontSize: "0.8125rem", cursor: "pointer", whiteSpace: "nowrap" },
  close: { background: "transparent", border: "none", color: "#92400e", cursor: "pointer", display: "flex", padding: 4 },
};

export function Layout() {
  const navigate = useNavigate();

  function logout() {
    setToken(null);
    setUser(null);
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/dashboard">
          <span className="brand-mark">LR</span>
          <span>LeadRescue</span>
        </Link>
        <nav>
          <NavLink to="/dashboard"><LayoutDashboard size={18} /> Dashboard</NavLink>
          <NavLink to="/leads"><Table2 size={18} /> Leads</NavLink>
          <NavLink to="/calendar"><CalendarRange size={18} /> Calendar</NavLink>
          <NavLink to="/settings"><Settings size={18} /> Settings</NavLink>
        </nav>
        <button className="ghost full" onClick={logout}><LogOut size={18} /> Logout</button>
      </aside>
      <main className="main-panel">
        <VerifyEmailBanner />
        <Outlet />
      </main>
    </div>
  );
}

export function StatCard({ label, value, icon }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon || <CalendarDays size={20} />}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function Badge({ children, tone = "neutral" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
