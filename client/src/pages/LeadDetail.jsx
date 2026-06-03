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
  const [drafting, setDrafting] = useState(false);
  const [slots, setSlots] = useState([]);
  const [showBooking, setShowBooking] = useState(false);
  const [bookingSlot, setBookingSlot] = useState("");
  const [booking, setBooking] = useState(false);

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

  async function setHandoff(mode) {
    await api(`/api/leads/${id}/handoff`, { method: "POST", body: { mode } });
    await loadLead();
  }

  async function draftWithAi() {
    setDrafting(true);
    try {
      const { suggestion } = await api(`/api/leads/${id}/suggest-reply`, { method: "POST" });
      if (suggestion) setManualMessage(suggestion);
    } catch {
      /* ignore */
    } finally {
      setDrafting(false);
    }
  }

  async function openBooking() {
    setShowBooking(true);
    if (!slots.length) {
      try {
        const { slots: s } = await api("/api/availability");
        setSlots(s);
        if (s.length) setBookingSlot(s[0].startAt);
      } catch { /* ignore */ }
    }
  }

  async function bookManually(e) {
    e.preventDefault();
    if (!bookingSlot) return;
    setBooking(true);
    try {
      await api("/api/appointments/book", { method: "POST", body: { leadId: id, startAt: bookingSlot, notes: "Manually booked by team." } });
      setShowBooking(false);
      await loadLead();
    } catch (err) {
      alert(err.message);
    } finally {
      setBooking(false);
    }
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

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
          <h2 style={{ margin: 0 }}>Appointments</h2>
          {lead.status !== "closed" && (
            <button className="ghost small" onClick={openBooking} style={{ fontSize: "0.78rem" }}>
              + Book appointment
            </button>
          )}
        </div>

        {showBooking && (
          <form onSubmit={bookManually} style={{ margin: "10px 0", padding: "12px 14px", background: "#f8fafc", border: "1px solid var(--line)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>Book an appointment</div>
            {slots.length === 0 ? (
              <p style={{ fontSize: "0.83rem", color: "#94a3b8", margin: 0 }}>No available slots — add availability in Settings first.</p>
            ) : (
              <select value={bookingSlot} onChange={(e) => setBookingSlot(e.target.value)} style={{ padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 8, fontSize: "0.88rem" }}>
                {slots.map((s) => (
                  <option key={s.startAt} value={s.startAt}>
                    {new Date(s.startAt).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </option>
                ))}
              </select>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              {slots.length > 0 && (
                <button className="button" type="submit" disabled={booking} style={{ fontSize: "0.83rem" }}>
                  {booking ? "Booking…" : "Confirm booking"}
                </button>
              )}
              <button type="button" className="ghost" onClick={() => setShowBooking(false)} style={{ fontSize: "0.83rem" }}>Cancel</button>
            </div>
          </form>
        )}

        {lead.appointments.length ? (
          lead.appointments.map((apt) => (
            <div key={apt.id} className="detail-field">
              <span className="detail-label">{apt.status}</span>
              <strong>{new Date(apt.startAt).toLocaleString()} – {new Date(apt.endAt).toLocaleTimeString()}</strong>
              {apt.notes && <p className="apt-notes">{apt.notes}</p>}
            </div>
          ))
        ) : (
          <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>No appointment booked yet.</p>
        )}

        <h2>Notes</h2>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows="5" />
        <button className="button" onClick={saveNotes}>Save notes</button>
      </section>

      <section className="panel">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>Conversation</h2>
          {lead.handoffMode === "human" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="badge" style={{ background: "#dcfce7", color: "#166534" }}>You're handling this</span>
              <button className="ghost small" onClick={() => setHandoff("ai")}>Hand back to AI</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="badge" style={{ background: "#e6f4f1", color: "var(--accent-dark)" }}>AI is replying</span>
              <button className="ghost small" onClick={() => setHandoff("human")}>Take over</button>
            </div>
          )}
        </div>
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="button" type="submit">Send SMS</button>
            <button type="button" className="ghost" onClick={draftWithAi} disabled={drafting}>
              {drafting ? "Drafting…" : "✨ Draft with AI"}
            </button>
          </div>
        </form>
        {lead.handoffMode !== "human" && (
          <p style={{ margin: "8px 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>
            The AI is auto-replying to this customer. Sending a message or clicking "Take over" pauses it so you can handle the thread.
          </p>
        )}
      </section>
    </div>
  );
}
