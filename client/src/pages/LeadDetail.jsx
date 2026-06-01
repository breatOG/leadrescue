import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client.js";
import { Badge } from "../components/Layout.jsx";

export default function LeadDetail() {
  const { id } = useParams();
  const [lead, setLead] = useState(null);
  const [manualMessage, setManualMessage] = useState("");
  const [notes, setNotes] = useState("");

  async function loadLead() {
    const data = await api(`/api/leads/${id}`);
    setLead(data.lead);
    setNotes(data.lead.manualNotes || "");
  }

  useEffect(() => {
    loadLead();
  }, [id]);

  async function saveNotes() {
    await api(`/api/leads/${id}`, { method: "PATCH", body: { manualNotes: notes } });
    await loadLead();
  }

  async function closeLead() {
    await api(`/api/leads/${id}`, { method: "PATCH", body: { status: "closed" } });
    await loadLead();
  }

  async function sendManualMessage(event) {
    event.preventDefault();
    if (!manualMessage.trim()) return;
    await api(`/api/leads/${id}/manual-message`, { method: "POST", body: { body: manualMessage } });
    setManualMessage("");
    await loadLead();
  }

  if (!lead) return <div className="page"><h1>Lead</h1><p>Loading...</p></div>;

  return (
    <div className="page detail-grid">
      <section className="panel">
        <div className="page-header compact">
          <div>
            <p className="eyebrow">Lead detail</p>
            <h1>{lead.customerName || lead.customerPhone}</h1>
          </div>
          <button className="ghost" onClick={closeLead}>Mark closed</button>
        </div>
        <div className="field-grid">
          <span>Status <Badge>{lead.status}</Badge></span>
          <span>Priority <Badge tone={lead.priority}>{lead.priority}</Badge></span>
          <span>Phone <strong>{lead.customerPhone}</strong></span>
          <span>Job type <strong>{lead.jobType || "Unknown"}</strong></span>
          <span>ZIP <strong>{lead.zipCode || "Unknown"}</strong></span>
          <span>Urgency <strong>{lead.urgency || "Unknown"}</strong></span>
        </div>
        <h2>AI summary</h2>
        <p className="summary">{lead.aiSummary || "The AI is still qualifying this lead."}</p>
        <h2>Appointment details</h2>
        {lead.appointments.length ? (
          lead.appointments.map((appointment) => (
            <p key={appointment.id}>{new Date(appointment.startAt).toLocaleString()} to {new Date(appointment.endAt).toLocaleTimeString()}</p>
          ))
        ) : (
          <p>No appointment booked yet.</p>
        )}
        <h2>Manual notes</h2>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows="5" />
        <button className="button" onClick={saveNotes}>Save notes</button>
      </section>

      <section className="panel">
        <h2>Conversation history</h2>
        <div className="message-thread">
          {lead.messages.map((message) => (
            <div className={`message ${message.direction}`} key={message.id}>
              <small>{message.channel} · {message.direction} · {new Date(message.createdAt).toLocaleString()}</small>
              <p>{message.body}</p>
            </div>
          ))}
        </div>
        <form className="manual-message" onSubmit={sendManualMessage}>
          <textarea value={manualMessage} onChange={(e) => setManualMessage(e.target.value)} placeholder="Send a manual SMS..." rows="3" />
          <button className="button" type="submit">Send SMS</button>
        </form>
      </section>
    </div>
  );
}
