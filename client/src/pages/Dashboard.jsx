import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarCheck, MessageCircle, PhoneMissed } from "lucide-react";
import { api } from "../api/client.js";
import { Badge, StatCard } from "../components/Layout.jsx";

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api("/api/dashboard").then(setData);
  }, []);

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
