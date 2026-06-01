import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { CalendarDays, LayoutDashboard, LogOut, Settings, Table2 } from "lucide-react";
import { setToken } from "../api/client.js";

export function Layout() {
  const navigate = useNavigate();

  function logout() {
    setToken(null);
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
          <NavLink to="/settings"><Settings size={18} /> Settings</NavLink>
        </nav>
        <button className="ghost full" onClick={logout}><LogOut size={18} /> Logout</button>
      </aside>
      <main className="main-panel">
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
