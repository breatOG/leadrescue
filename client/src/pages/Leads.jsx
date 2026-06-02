import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, getCache, setCache } from "../api/client.js";
import { Badge } from "../components/Layout.jsx";

function toneForPriority(priority) {
  if (priority === "emergency") return "emergency";
  if (priority === "high") return "high";
  if (priority === "low") return "low";
  return "normal";
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

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Pipeline</p>
          <h1>Leads</h1>
        </div>
      </div>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Priority</th>
                <th>Customer</th>
                <th>Job / Issue</th>
                <th>Urgency</th>
                <th>Last message</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td><Link to={`/leads/${lead.id}`}><Badge>{lead.status.replace("_", " ")}</Badge></Link></td>
                  <td><Badge tone={toneForPriority(lead.priority)}>{lead.priority}</Badge></td>
                  <td>
                    <span title={lead.source === "missed_call" ? "Voice call" : "SMS"}>{lead.source === "missed_call" ? "📞 " : "💬 "}</span>
                    {lead.customerName || lead.customerPhone}
                    {lead.customerName && <span style={{color:"var(--muted)",fontSize:"0.8em",display:"block"}}>{lead.customerPhone}</span>}
                  </td>
                  <td>{lead.jobType || <span style={{color:"var(--muted)"}}>Unqualified</span>}</td>
                  <td>{lead.urgency || <span style={{color:"var(--muted)"}}>—</span>}</td>
                  <td className="truncate">{lead.lastMessage || "No messages yet"}</td>
                  <td>{new Date(lead.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
