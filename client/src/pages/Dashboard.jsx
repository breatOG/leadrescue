import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CalendarCheck, MessageCircle, PhoneMissed, TrendingUp, Zap } from "lucide-react";
import { api, getCache, setCache } from "../api/client.js";
import { Badge } from "../components/Layout.jsx";

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, color }) {
  const colors = {
    blue:   { bg: "#eff6ff", icon: "#2563eb", border: "#bfdbfe" },
    green:  { bg: "#f0fdf4", icon: "#16a34a", border: "#bbf7d0" },
    purple: { bg: "#faf5ff", icon: "#7c3aed", border: "#ddd6fe" },
    orange: { bg: "#fff7ed", icon: "#c2410c", border: "#fed7aa" },
  };
  const c = colors[color] || colors.blue;
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: "22px 24px", display: "flex", flexDirection: "column", gap: 14, transition: "all 0.2s", cursor: "default" }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 12px 30px rgba(15,23,42,0.1)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}>
      <div style={{ width: 42, height: 42, borderRadius: 11, background: c.bg, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: c.icon }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: "2.2rem", fontWeight: 900, color: "#0f172a", lineHeight: 1, letterSpacing: "-0.02em" }}>{value ?? "—"}</div>
        <div style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: 600, marginTop: 4 }}>{label}</div>
      </div>
    </div>
  );
}

// ── Usage bar ─────────────────────────────────────────────────────────────────
function UsagePanel({ usage }) {
  if (!usage) return null;
  const { plan, subscriptionStatus, leadsThisMonth, leadsLimit } = usage;
  const isUnlimited = !leadsLimit || leadsLimit >= 1e10;
  const pct = isUnlimited ? 0 : Math.min((leadsThisMonth / leadsLimit) * 100, 100);
  const remaining = isUnlimited ? null : leadsLimit - leadsThisMonth;
  const barColor = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#0f766e";
  const planColors = { starter: "#64748b", pro: "#2563eb", scale: "#7c3aed" };
  const pc = planColors[plan] || "#64748b";
  const statusOk = subscriptionStatus === "active";

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: "20px 24px", marginBottom: 20, display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: `${pc}15`, border: `1px solid ${pc}30`, display: "flex", alignItems: "center", justifyContent: "center", color: pc }}>
          <TrendingUp size={18} />
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 800, fontSize: "0.88rem", color: "#0f172a", textTransform: "capitalize" }}>{plan || "Starter"} plan</span>
            <span style={{ fontSize: "0.7rem", fontWeight: 700, color: statusOk ? "#16a34a" : "#ef4444", background: statusOk ? "#f0fdf4" : "#fef2f2", border: `1px solid ${statusOk ? "#bbf7d0" : "#fecaca"}`, padding: "1px 8px", borderRadius: 99 }}>
              {statusOk ? "Active" : subscriptionStatus}
            </span>
          </div>
          <div style={{ fontSize: "0.76rem", color: "#64748b", marginTop: 2 }}>
            {isUnlimited ? "Unlimited leads" : `${leadsThisMonth} of ${leadsLimit} leads used this month`}
          </div>
        </div>
      </div>
      {!isUnlimited && (
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ height: 7, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 99, transition: "width 0.6s ease" }} />
          </div>
          {pct >= 80 && (
            <div style={{ fontSize: "0.74rem", color: pct >= 100 ? "#ef4444" : "#b45309", fontWeight: 600, marginTop: 5 }}>
              {pct >= 100 ? "Limit reached — upgrade to capture more" : `${remaining} lead${remaining === 1 ? "" : "s"} remaining`}
            </div>
          )}
        </div>
      )}
      <Link to="/settings" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.8rem", color: "#0f766e", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>
        Manage plan <ArrowRight size={13} />
      </Link>
    </div>
  );
}

// ── Time helper ───────────────────────────────────────────────────────────────
function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData] = useState(() => getCache("dashboard"));
  const [usage, setUsage] = useState(() => getCache("usage"));
  const [error, setError] = useState("");

  useEffect(() => {
    function load() {
      api("/api/dashboard").then((d) => { setData(d); setCache("dashboard", d); }).catch((e) => setError(e.message));
      api("/api/payments/usage").then((u) => { setUsage(u); setCache("usage", u); }).catch(() => {});
    }
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  if (error) return (
    <div className="page">
      <h1>Dashboard</h1>
      <div style={{ padding: "18px 20px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, color: "#b91c1c", fontSize: "0.9rem" }}>{error}</div>
    </div>
  );
  if (!data) return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div><p className="eyebrow">Command center</p><h1 style={{ margin: 0 }}>Dashboard</h1></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 116, borderRadius: 14 }} />)}
      </div>
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 24 }}>
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skeleton-row" />)}
      </div>
    </div>
  );

  const hasConversations = data.recentConversations.length > 0;

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <p className="eyebrow">Command center</p>
          <h1 style={{ margin: 0 }}>Dashboard</h1>
        </div>
        <Link to="/leads" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#0f766e", color: "#fff", fontWeight: 700, fontSize: "0.88rem", padding: "10px 18px", borderRadius: 10, textDecoration: "none", boxShadow: "0 4px 12px rgba(15,118,110,0.3)" }}>
          <Zap size={14} /> View all leads
        </Link>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
        <StatCard label="Total leads" value={data.totalLeads} icon={<MessageCircle size={19} />} color="blue" />
        <StatCard label="Calls recovered" value={data.missedCallsRecovered} icon={<PhoneMissed size={19} />} color="green" />
        <StatCard label="Appointments booked" value={data.appointmentsBooked} icon={<CalendarCheck size={19} />} color="purple" />
        <StatCard label="High priority" value={data.highPriorityLeads} icon={<AlertTriangle size={19} />} color="orange" />
      </div>

      {/* Usage strip */}
      <UsagePanel usage={usage} />

      {/* Recent conversations */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "#0f172a" }}>Recent conversations</h2>
            <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: "#94a3b8" }}>Latest leads and customer interactions</p>
          </div>
          <Link to="/leads" style={{ fontSize: "0.8rem", color: "#0f766e", fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
            See all <ArrowRight size={13} />
          </Link>
        </div>

        {!hasConversations ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "#94a3b8" }}>
            <MessageCircle size={36} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
            <p style={{ margin: 0, fontWeight: 600 }}>No conversations yet</p>
            <p style={{ margin: "6px 0 0", fontSize: "0.84rem" }}>Leads will appear here when customers call or text your number</p>
          </div>
        ) : (
          <div>
            {data.recentConversations.map((lead, i) => {
              const priorityDot = { emergency: "#ef4444", high: "#f59e0b", normal: "#0f766e", low: "#94a3b8" };
              const dot = priorityDot[lead.priority] || "#94a3b8";
              const lastMsg = lead.messages?.[0];
              return (
                <Link
                  key={lead.id}
                  to={`/leads/${lead.id}`}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 24px", borderBottom: i < data.recentConversations.length - 1 ? "1px solid #f8fafc" : "none", textDecoration: "none", color: "inherit", transition: "background 0.12s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                  onMouseLeave={e => e.currentTarget.style.background = ""}
                >
                  {/* Avatar */}
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#f1f5f9", border: `2px solid ${dot}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 800, fontSize: "0.82rem", color: "#475569" }}>
                    {(lead.customerName || lead.customerPhone || "?")[0].toUpperCase()}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#0f172a" }}>{lead.customerName || lead.customerPhone}</span>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flexShrink: 0 }} />
                    </div>
                    <p style={{ margin: "3px 0 0", color: "#64748b", fontSize: "0.8rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {lead.lastMessage || "No messages yet"}
                    </p>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                    <Badge tone={lead.priority}>{lead.priority}</Badge>
                    {lastMsg && <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>{timeAgo(lastMsg.createdAt)}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
