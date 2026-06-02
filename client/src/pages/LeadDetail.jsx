import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, getCache, setCache } from "../api/client.js";
import { Badge } from "../components/Layout.jsx";

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div className="detail-field">
      <span className="detail-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function channelIcon(channel) {
  if (channel === "voice") return "📞";
  if (channel === "sms") return "💬";
  return "📋";
}

export default function LeadDetail() {
  const { id } = useParams();
  const [lead, setLead] = useState(() => getCache(`lead_${id}`));
  const [manualMessage, setManualMessage] = useState("");
  const [notes, setNotes] = useState("");

  async function loadLead() {
    const data = await api(`/api/leads/${id}`);
    setLead(data.lead);
    setNotes(data.lead.manualNotes || "");
    setCache(`lead_${id}`, data.lead);
  }

  useEffect(() => {
    // Render instantly from cache (or reset to skeleton when switching leads), then refresh.
    const cached = getCache(`lead_${id}`);
    setLead(cached);
    if (cached) setNotes(cached.manualNotes || "");
    loadLead();
    const interval = setInterval(loadLead, 15000);
    return () => clearInterval(interval);
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

  if (!lead) return (
    <div className="page detail-grid">
      <section className="panel">
        <div className="skeleton" style={{ height: 26, width: "55%", marginBottom: 18 }} />
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton skeleton-row" />)}
      </section>
      <section className="panel">
        <div className="skeleton" style={{ height: 20, width: "40%", marginBottom: 16 }} />
        {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 60, marginBottom: 12, borderRadius: 8 }} />)}
      </section>
    </div>
  );

  const visibleMessages = lead.messages.filter((m) => m.body !== "[call started]");

  return (
    <div className="page detail-grid">
      <section className="panel">
        <div className="page-header compact">
          <div>
            <p className="eyebrow">{lead.source === "missed_call" ? "📞 Voice lead" : "💬 SMS lead"} · Lead detail</p>
            <h1>{lead.customerName || lead.customerPhone}</h1>
          </div>
          <button className="ghost" onClick={closeLead}>Mark closed</button>
        </div>

        <div className="field-grid">
          <span>Status <Badge>{lead.status.replace("_", " ")}</Badge></span>
          <span>Priority <Badge tone={lead.priority}>{lead.priority}</Badge></span>
          <span>Source <Badge>{lead.source === "missed_call" ? "Voice call" : lead.source}</Badge></span>
        </div>

        <h2>Customer info</h2>
        <div className="detail-fields">
          <Field label="Name" value={lead.customerName} />
          <Field label="Phone" value={lead.customerPhone} />
          <Field label="Address" value={lead.address} />
          <Field label="ZIP code" value={lead.zipCode} />
        </div>

        <h2>Job details</h2>
        <div className="detail-fields">
          <Field label="Job type" value={lead.jobType} />
          <Field label="Issue" value={lead.issueDescription} />
          <Field label="Urgency" value={lead.urgency} />
          <Field label="Preferred appointment" value={lead.preferredAppointmentTime} />
          <Field label="Photos available" value={lead.photosAvailable != null ? (lead.photosAvailable ? "Yes" : "No") : null} />
        </div>

        <h2>AI summary</h2>
        <p className="summary">{lead.aiSummary || "The AI is still qualifying this lead."}</p>

        <h2>Appointments</h2>
        {lead.appointments.length ? (
          lead.appointments.map((apt) => (
            <div key={apt.id} className="detail-field">
              <span className="detail-label">{apt.status}</span>
              <strong>{new Date(apt.startAt).toLocaleString()} – {new Date(apt.endAt).toLocaleTimeString()}</strong>
              {apt.notes && <p className="apt-notes">{apt.notes}</p>}
            </div>
          ))
        ) : (
          <p>No appointment booked yet.</p>
        )}

        <h2>Notes</h2>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows="5" />
        <button className="button" onClick={saveNotes}>Save notes</button>
      </section>

      <section className="panel">
        <h2>Conversation</h2>
        <div className="message-thread">
          {visibleMessages.map((message) => (
            <div className={`message ${message.direction}`} key={message.id}>
              <small>
                {channelIcon(message.channel)} {message.direction === "inbound" ? "Customer" : "AI"} · {new Date(message.createdAt).toLocaleString()}
              </small>
              <p>{message.body}</p>
            </div>
          ))}
          {visibleMessages.length === 0 && <p>No messages yet.</p>}
        </div>
        <form className="manual-message" onSubmit={sendManualMessage}>
          <textarea value={manualMessage} onChange={(e) => setManualMessage(e.target.value)} placeholder="Send a manual SMS..." rows="3" />
          <button className="button" type="submit">Send SMS</button>
        </form>
      </section>
    </div>
  );
}
