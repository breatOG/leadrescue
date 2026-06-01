import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { Badge } from "../components/Layout.jsx";

function toneForPriority(priority) {
  if (priority === "emergency") return "emergency";
  if (priority === "high") return "high";
  if (priority === "low") return "low";
  return "normal";
}

export default function Leads() {
  const [leads, setLeads] = useState([]);

  useEffect(() => {
    api("/api/leads").then((data) => setLeads(data.leads));
  }, []);

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
                <th>Customer phone</th>
                <th>Job type</th>
                <th>Last message</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td><Link to={`/leads/${lead.id}`}><Badge>{lead.status}</Badge></Link></td>
                  <td><Badge tone={toneForPriority(lead.priority)}>{lead.priority}</Badge></td>
                  <td>{lead.customerPhone}</td>
                  <td>{lead.jobType || "Unqualified"}</td>
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
