import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarCheck, MessageCircle, PhoneMissed, TrendingUp } from "lucide-react";
import { api } from "../api/client.js";
import { Badge, StatCard } from "../components/Layout.jsx";

function UsageBar({ used, limit, isUnlimited }) {
  if (isUnlimited) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: "0.5rem 0" }}>
        <div style={{ flex: 1, height: 8, background: "#e5e7eb", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ width: "100%", height: "100%", background: "linear-gradient(90deg, #2563eb, #7c3aed)", borderRadius: 99 }} />
        </div>
        <span style={{ fontSize: "0.8rem", color: "#6b7280", whiteSpace: "nowrap" }}>Unlimited</span>
      </div>
    );
  }

  const pct = Math.min((used / limit) * 100, 100);
  const color = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#2563eb";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: "0.5rem 0" }}>
      <div style={{ flex: 1, height: 8, background: "#e5e7eb", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.4s ease" }} />
      </div>
      <span style={{ fontSize: "0.8rem", color: "#6b7280", whiteSpace: "nowrap" }}>{used} / {limit}</span>
    </div>
  );
}

function PlanBadge({ plan, status }) {
  const colors = { starter: "#6b7280", pro: "#2563eb", scale: "#7c3aed" };
  const color = colors[plan] || "#6b7280";
  return (
    <span style={{ display: "inline-block", background: `${color}18`, color, border: `1px solid ${color}40`, borderRadius: 6, padding: "2px 10px", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.03em", textTransform: "capitalize" }}>
      {plan || "Starter"}
    </span>
  );
}

function UsagePanel({ usage }) {
  if (!usage) return null;

  const { plan, planLabel, subscriptionStatus, leadsThisMonth, leadsLimit, voice } = usage;
  const isUnlimited = leadsLimit === null || leadsLimit >= 1e10;
  const remaining = isUnlimited ? null : leadsLimit - leadsThisMonth;
  const pct = isUnlimited ? 0 : (leadsThisMonth / leadsLimit) * 100;
  const nearLimit = !isUnlimited && pct >= 80;

  return (
    <div className="panel" style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <TrendingUp size={18} style={{ color: "#2563eb" }} />
          <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>Monthly usage</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <PlanBadge plan={plan} status={subscriptionStatus} />
          {subscriptionStatus !== "active" && (
            <span style={{ fontSize: "0.75rem", color: "#ef4444", fontWeight: 600 }}>
              {subscriptionStatus === "past_due" ? "Past due" : "Inactive"}
            </span>
          )}
        </div>
      </div>

      <div style={{ fontSize: "0.85rem", color: "#374151", marginBottom: 4 }}>
        Leads captured this month
      </div>
      <UsageBar used={leadsThisMonth} limit={leadsLimit} isUnlimited={isUnlimited} />

      {nearLimit && (
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.82rem", color: pct >= 100 ? "#ef4444" : "#b45309", fontWeight: 500 }}>
          {pct >= 100
            ? "You've reached your monthly lead limit. Upgrade to capture more leads."
            : `Only ${remaining} lead${remaining === 1 ? "" : "s"} remaining this month.`}
        </p>
      )}

      {!isUnlimited && !nearLimit && remaining !== null && (
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.82rem", color: "#6b7280" }}>
          {remaining} lead{remaining === 1 ? "" : "s"} remaining this month
          {!voice && " · Voice AI not included on this plan"}
        </p>
      )}

      {nearLimit && (
        <Link to="/settings" style={{ display: "inline-block", marginTop: 10, fontSize: "0.82rem", color: "#2563eb", fontWeight: 600, textDecoration: "none" }}>
          Manage subscription →
        </Link>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    function load() {
      api("/api/dashboard").then(setData).catch((e) => setError(e.message));
      api("/api/payments/usage").then(setUsage).catch(() => {});
    }
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  if (error) return <div className="page"><h1>Dashboard</h1><p style={{ color: "#ef4444" }}>{error}</p></div>;
  if (!data) return <div className="page"><h1>Dashboard</h1><p>Loading...</p></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Lead recovery command center</p>
          <h1>Dashboard</h1>
        </div>
      </div>
      <div className="stats-grid">
        <StatCard label="Total leads" value={data.totalLeads} icon={<MessageCircle size={20} />} />
        <StatCard label="Missed calls recovered" value={data.missedCallsRecovered} icon={<PhoneMissed size={20} />} />
        <StatCard label="Appointments booked" value={data.appointmentsBooked} icon={<CalendarCheck size={20} />} />
        <StatCard label="High priority leads" value={data.highPriorityLeads} icon={<AlertTriangle size={20} />} />
      </div>
      <UsagePanel usage={usage} />
      <section className="panel">
        <h2>Recent conversations</h2>
        <div className="conversation-list">
          {data.recentConversations.map((lead) => (
            <Link className="conversation-item" to={`/leads/${lead.id}`} key={lead.id}>
              <div>
                <strong>{lead.customerName || lead.customerPhone}</strong>
                <p>{lead.lastMessage || "No messages yet"}</p>
              </div>
              <Badge tone={lead.priority}>{lead.priority}</Badge>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
