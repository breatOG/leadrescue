import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, getCache, setCache } from "../api/client.js";
import { Badge } from "../components/Layout.jsx";
import { isLeadNew } from "../utils/seenLeads.js";

function toneForPriority(priority) {
  if (priority === "emergency") return "emergency";
  if (priority === "high") return "high";
  if (priority === "low") return "low";
  return "normal";
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function Leads() {
  const [leads, setLeads] = useState(() => getCache("leads"));
  const [error, setError] = useState("");

  useEffect(() => {
    function load() {
      api("/api/leads")
        .then((data) => { setLeads(data.leads); setCache("leads", data.leads); })
        .catch((e) => setError(e.message));
    }
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  if (error) return <div className="page"><h1>Leads</h1><p style={{ color: "#ef4444" }}>{error}</p></div>;
  if (leads === null) return (
    <div className="page">
      <div className="page-header"><div><p className="eyebrow">Pipeline</p><h1>Leads</h1></div></div>
      <section className="panel">
        {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton skeleton-row" />)}
      </section>
    </div>
  );

  const newCount = leads.filter(isLeadNew).length;

  useEffect(() => {
    document.title = newCount > 0 ? `(${newCount}) LeadRescue` : "LeadRescue";
  }, [newCount]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Pipeline</p>
          <h1>Leads</h1>
        </div>
        {newCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "8px 14px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#16a34a", display: "inline-block", animation: "pulse-dot 2s ease-in-out infinite" }} />
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#16a34a" }}>
              {newCount} new {newCount === 1 ? "lead" : "leads"}
            </span>
          </div>
        )}
      </div>

      {/* Mobile: inbox-style cards */}
      <div className="leads-cards">
        {leads.map((lead) => {
          const isNew = isLeadNew(lead);
          return (
            <Link key={lead.id} to={`/leads/${lead.id}`} className="lead-card"
              style={isNew ? { borderLeft: "3px solid #16a34a", background: "#f0fdf4" } : {}}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div className="lead-card-avatar" data-priority={lead.priority}>
                  {(lead.customerName || lead.customerPhone || "?")[0].toUpperCase()}
                </div>
                {isNew && (
                  <span style={{ position: "absolute", top: -1, right: -1, width: 9, height: 9, borderRadius: "50%", background: "#16a34a", border: "2px solid #fff", animation: "pulse-dot 2s ease-in-out infinite" }} />
                )}
              </div>
              <div className="lead-card-body">
                <div className="lead-card-head">
                  <span className="lead-card-name">
                    {lead.customerName || lead.customerPhone}
                    {isNew && <span style={{ marginLeft: 6, fontSize: "0.65rem", fontWeight: 800, color: "#16a34a", background: "#dcfce7", padding: "1px 6px", borderRadius: 99, verticalAlign: "middle" }}>NEW</span>}
                  </span>
                  <span className="lead-card-date">{timeAgo(lead.updatedAt)}</span>
                </div>
                <div className="lead-card-sub">
                  {lead.source === "missed_call" ? "📞" : "💬"} {lead.jobType || "Unqualified lead"}
                </div>
                {lead.urgency && <div style={{ fontSize: "0.76rem", color: "#64748b", marginTop: 2 }}>⚡ {lead.urgency}</div>}
                <div className="lead-card-tags">
                  <Badge tone={toneForPriority(lead.priority)}>{lead.priority}</Badge>
                  <Badge>{lead.status.replace("_", " ")}</Badge>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Desktop: table */}
      <section className="panel leads-table-wrap">
        <div className="table-wrap">
          <table className="leads-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Priority</th>
                <th>Customer</th>
                <th>Job / Issue</th>
                <th>Urgency</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const isNew = isLeadNew(lead);
                return (
                  <tr key={lead.id} style={isNew ? { background: "#f0fdf4", borderLeft: "3px solid #16a34a" } : {}}>
                    <td data-label="Status"><Link to={`/leads/${lead.id}`}><Badge>{lead.status.replace("_", " ")}</Badge></Link></td>
                    <td data-label="Priority"><Badge tone={toneForPriority(lead.priority)}>{lead.priority}</Badge></td>
                    <td data-label="Customer">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                        {isNew && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#16a34a", display: "inline-block", animation: "pulse-dot 2s ease-in-out infinite" }} />}
                        <span title={lead.source === "missed_call" ? "Voice call" : "SMS"}>{lead.source === "missed_call" ? "📞 " : "💬 "}</span>
                        <span>
                          {lead.customerName || lead.customerPhone}
                          {lead.customerName && <span style={{ color: "var(--muted)", fontSize: "0.8em", display: "block" }}>{lead.customerPhone}</span>}
                        </span>
                      </span>
                    </td>
                    <td data-label="Job / Issue">{lead.jobType || <span style={{color:"var(--muted)"}}>Unqualified</span>}</td>
                    <td data-label="Urgency">{lead.urgency || <span style={{color:"var(--muted)"}}>—</span>}</td>
                    <td data-label="Updated">{timeAgo(lead.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
