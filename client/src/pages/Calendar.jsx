import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, MapPin, Phone, User } from "lucide-react";
import { api, getCache, setCache } from "../api/client.js";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const URGENCY = {
  emergency: { bg: "#fee2e2", text: "#dc2626", border: "#fca5a5", label: "Emergency" },
  high:      { bg: "#fef3c7", text: "#d97706", border: "#fde68a", label: "High" },
  normal:    { bg: "#dbeafe", text: "#2563eb", border: "#bfdbfe", label: "Normal" },
  low:       { bg: "#f3f4f6", text: "#6b7280", border: "#e5e7eb", label: "Low" }
};

const STATUS_COLOR = { booked: "#2563eb", completed: "#16a34a", cancelled: "#ef4444" };

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function AppointmentCard({ appt, onUpdate }) {
  const urg = URGENCY[appt.lead?.priority] || URGENCY.normal;
  const [updating, setUpdating] = useState(null);
  const isAi = !appt.source || appt.source === "ai";

  async function updateStatus(status) {
    setUpdating(status);
    try {
      await api(`/api/appointments/${appt.id}`, { method: "PATCH", body: { status } });
      onUpdate?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div style={{ border: `1px solid ${urg.border}`, background: urg.bg, borderRadius: 10, padding: "0.85rem 1rem", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Clock size={13} style={{ color: "#6b7280" }} />
          <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>
            {fmtTime(appt.startAt)} – {fmtTime(appt.endAt)}
          </span>
          {isAi ? (
            <span style={{ fontSize: "0.65rem", fontWeight: 800, color: "#0f766e", background: "#ccfbf1", border: "1px solid #99f6e4", padding: "1px 7px", borderRadius: 99 }}>
              🤖 AI scheduled
            </span>
          ) : (
            <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "#6b7280", background: "#f3f4f6", border: "1px solid #e5e7eb", padding: "1px 7px", borderRadius: 99 }}>
              Manual
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: urg.text, background: "white", border: `1px solid ${urg.border}`, padding: "1px 8px", borderRadius: 99 }}>
            {urg.label}
          </span>
          <span style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: STATUS_COLOR[appt.status] || "#6b7280" }}>
            {appt.status}
          </span>
        </div>
      </div>

      <Link to={`/leads/${appt.leadId}`} style={{ textDecoration: "none", color: "inherit" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
          <User size={12} style={{ color: "#6b7280", flexShrink: 0 }} />
          <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
            {appt.lead?.customerName || "Unknown customer"}
          </span>
        </div>

        {appt.lead?.customerPhone && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
            <Phone size={12} style={{ color: "#6b7280", flexShrink: 0 }} />
            <span style={{ fontSize: "0.82rem", color: "#374151" }}>{appt.lead.customerPhone}</span>
          </div>
        )}

        {appt.lead?.jobType && (
          <div style={{ fontSize: "0.82rem", color: "#374151", marginBottom: 2 }}>
            <strong>Job:</strong> {appt.lead.jobType}
          </div>
        )}

        {appt.lead?.issueDescription && (
          <div style={{ fontSize: "0.82rem", color: "#374151", marginBottom: 2 }}>
            <strong>Issue:</strong> {appt.lead.issueDescription}
          </div>
        )}

        {(appt.lead?.address || appt.lead?.zipCode) && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
            <MapPin size={12} style={{ color: "#6b7280", flexShrink: 0 }} />
            <span style={{ fontSize: "0.82rem", color: "#374151" }}>
              {[appt.lead.address, appt.lead.zipCode].filter(Boolean).join(", ")}
            </span>
          </div>
        )}

        {appt.lead?.urgency && (
          <div style={{ fontSize: "0.82rem", color: "#374151", marginBottom: 2 }}>
            <strong>Urgency:</strong> {appt.lead.urgency}
          </div>
        )}

        {appt.lead?.aiSummary && (
          <div style={{ marginTop: 8, fontSize: "0.78rem", color: "#6b7280", fontStyle: "italic", borderTop: "1px solid rgba(0,0,0,0.07)", paddingTop: 8 }}>
            {appt.lead.aiSummary}
          </div>
        )}

        {appt.notes && (
          <div style={{ marginTop: 4, fontSize: "0.78rem", color: "#6b7280" }}>
            <strong>Notes:</strong> {appt.notes}
          </div>
        )}
      </Link>

      {appt.status === "booked" && (
        <div style={{ display: "flex", gap: 6, marginTop: 10, borderTop: "1px solid rgba(0,0,0,0.07)", paddingTop: 8 }}>
          <button
            onClick={() => updateStatus("completed")}
            disabled={!!updating}
            style={{ flex: 1, padding: "5px 0", fontSize: "0.76rem", fontWeight: 700, background: "#dcfce7", color: "#15803d", border: "1px solid #bbf7d0", borderRadius: 7, cursor: "pointer", opacity: updating ? 0.6 : 1 }}
          >
            {updating === "completed" ? "Marking…" : "Mark complete"}
          </button>
          <button
            onClick={() => updateStatus("cancelled")}
            disabled={!!updating}
            style={{ flex: 1, padding: "5px 0", fontSize: "0.76rem", fontWeight: 700, background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 7, cursor: "pointer", opacity: updating ? 0.6 : 1 }}
          >
            {updating === "cancelled" ? "Cancelling…" : "Cancel"}
          </button>
        </div>
      )}
    </div>
  );
}

function AvailabilityBadge({ slot }) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f3f4f6", fontSize: "0.83rem" }}>
      <span style={{ fontWeight: 600, color: "#374151", width: 36 }}>{days[slot.dayOfWeek]}</span>
      <span style={{ color: "#6b7280" }}>{slot.startTime} – {slot.endTime}</span>
      <span style={{ color: "#9ca3af" }}>{slot.slotMinutes}min slots</span>
    </div>
  );
}

export default function CalendarPage() {
  const [appointments, setAppointments] = useState(() => getCache("appointments") || []);
  const [availability, setAvailability] = useState(() => getCache("availability") || []);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selected, setSelected] = useState(new Date());
  const [loading, setLoading] = useState(() => !getCache("appointments"));

  async function loadAppointments() {
    const [apptData, bizData] = await Promise.all([
      api("/api/appointments"),
      api("/api/business/settings")
    ]);
    const appts = apptData.appointments || [];
    const avail = bizData.business?.availability || [];
    setAppointments(appts); setCache("appointments", appts);
    setAvailability(avail); setCache("availability", avail);
  }

  useEffect(() => {
    loadAppointments().finally(() => setLoading(false));
    const interval = setInterval(loadAppointments, 20000);
    return () => clearInterval(interval);
  }, []);

  const today = new Date();
  const aiApptCount = appointments.filter((a) => !a.source || a.source === "ai").length;

  // Build month grid cells
  const firstOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const lastOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
  const cells = [];
  for (let i = 0; i < firstOfMonth.getDay(); i++) cells.push(null);
  for (let d = 1; d <= lastOfMonth.getDate(); d++) {
    cells.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  function apptCountForDay(date) {
    if (!date) return 0;
    return appointments.filter((a) => isSameDay(new Date(a.startAt), date)).length;
  }

  const selectedAppts = appointments
    .filter((a) => isSameDay(new Date(a.startAt), selected))
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));

  const todayAppts = appointments
    .filter((a) => isSameDay(new Date(a.startAt), today))
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));

  const upcomingAppts = appointments
    .filter((a) => new Date(a.startAt) > today && a.status === "booked")
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
    .slice(0, 5);

  if (loading) return (
    <div className="page">
      <div className="page-header"><div><p className="eyebrow">Appointments & schedule</p><h1>Calendar</h1></div></div>
      <div className="m-cal" style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 18, alignItems: "start" }}>
        <div className="skeleton" style={{ height: 360, borderRadius: 12 }} />
        <div className="skeleton" style={{ height: 220, borderRadius: 12 }} />
      </div>
    </div>
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Appointments & schedule</p>
          <h1>Calendar</h1>
        </div>
      </div>

      {aiApptCount > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 10, marginBottom: 18, fontSize: "0.82rem", color: "#0f766e" }}>
          <span style={{ fontSize: "1rem" }}>🤖</span>
          <span>
            <strong>{aiApptCount} appointment{aiApptCount !== 1 ? "s" : ""} were scheduled automatically</strong> — LeadRescue booked these when customers confirmed a time via text or call. They show the <strong>AI scheduled</strong> tag so you always know what came in on its own.
          </span>
        </div>
      )}

      {todayAppts.length > 0 && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <h2 style={{ marginTop: 0, marginBottom: 14 }}>
            Today — {today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            <span style={{ marginLeft: 10, fontWeight: 400, fontSize: "0.85rem", color: "#6b7280" }}>
              {todayAppts.length} appointment{todayAppts.length !== 1 ? "s" : ""}
            </span>
          </h2>
          {todayAppts.map((a) => <AppointmentCard key={a.id} appt={a} onUpdate={loadAppointments} />)}
        </div>
      )}

      <div className="m-cal" style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 18, alignItems: "start" }}>
        {/* Month grid */}
        <div>
          <div className="panel" style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <button
                className="ghost"
                style={{ padding: "4px 12px", fontSize: "1.1rem" }}
                onClick={() => setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </span>
              <button
                className="ghost"
                style={{ padding: "4px 12px", fontSize: "1.1rem" }}
                onClick={() => setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
              {DAY_NAMES.map((d) => (
                <div key={d} style={{ textAlign: "center", fontSize: "0.72rem", fontWeight: 700, color: "#9ca3af", padding: "4px 0", textTransform: "uppercase" }}>
                  {d}
                </div>
              ))}
              {cells.map((date, i) => {
                const count = apptCountForDay(date);
                const isToday = date && isSameDay(date, today);
                const isSel = date && isSameDay(date, selected);
                return (
                  <div
                    key={i}
                    onClick={() => date && setSelected(date)}
                    style={{
                      textAlign: "center",
                      padding: "6px 2px 10px",
                      borderRadius: 8,
                      cursor: date ? "pointer" : "default",
                      background: isSel ? "#2563eb" : isToday ? "#dbeafe" : "transparent",
                      color: isSel ? "#fff" : isToday ? "#1d4ed8" : date ? "#111827" : "transparent",
                      fontWeight: isToday || isSel ? 700 : 400,
                      fontSize: "0.88rem",
                      position: "relative",
                      minHeight: 38,
                      transition: "background 0.15s"
                    }}
                  >
                    {date?.getDate()}
                    {count > 0 && (
                      <div style={{ position: "absolute", bottom: 3, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 2, justifyContent: "center" }}>
                        {Array.from({ length: Math.min(count, 3) }).map((_, j) => (
                          <div key={j} style={{ width: 5, height: 5, borderRadius: "50%", background: isSel ? "rgba(255,255,255,0.8)" : "#2563eb" }} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected day appointments */}
          <div className="panel">
            <h3 style={{ marginTop: 0, marginBottom: 14 }}>
              {selected.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              {selectedAppts.length > 0 && (
                <span style={{ marginLeft: 8, fontWeight: 400, fontSize: "0.82rem", color: "#6b7280" }}>
                  {selectedAppts.length} appointment{selectedAppts.length !== 1 ? "s" : ""}
                </span>
              )}
            </h3>
            {selectedAppts.length === 0 ? (
              <p style={{ color: "#9ca3af", fontSize: "0.875rem", margin: 0 }}>No appointments on this day.</p>
            ) : (
              selectedAppts.map((a) => <AppointmentCard key={a.id} appt={a} onUpdate={loadAppointments} />)
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div>
          {upcomingAppts.length > 0 && (
            <div className="panel" style={{ marginBottom: 18 }}>
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>Upcoming</h3>
              {upcomingAppts.map((a) => {
                const urg = URGENCY[a.lead?.priority] || URGENCY.normal;
                return (
                  <Link key={a.id} to={`/leads/${a.leadId}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f3f4f6", textDecoration: "none", color: "inherit" }}>
                    <div style={{ flexShrink: 0, width: 8, height: 8, borderRadius: "50%", background: urg.text }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.lead?.customerName || a.lead?.customerPhone || "Unknown"}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                        {new Date(a.startAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {fmtTime(a.startAt)}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {availability.length > 0 && (
            <div className="panel">
              <h3 style={{ marginTop: 0, marginBottom: 10 }}>Your schedule</h3>
              <p style={{ fontSize: "0.78rem", color: "#9ca3af", marginTop: 0, marginBottom: 10 }}>
                AI books appointments in these windows. Edit in Settings.
              </p>
              {availability
                .slice()
                .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime))
                .map((s, i) => <AvailabilityBadge key={i} slot={s} />)}
            </div>
          )}

          {availability.length === 0 && (
            <div className="panel" style={{ textAlign: "center" }}>
              <AlertTriangle size={24} style={{ color: "#f59e0b", margin: "0 auto 8px" }} />
              <p style={{ fontSize: "0.85rem", color: "#6b7280", margin: 0 }}>No availability set. The AI can't offer appointment slots until you add hours in Settings.</p>
              <Link to="/settings" style={{ fontSize: "0.82rem", color: "#2563eb", fontWeight: 600, display: "inline-block", marginTop: 8 }}>
                Set availability →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
