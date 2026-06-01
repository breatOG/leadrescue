import { useEffect, useState } from "react";
import { CheckCircle, Zap } from "lucide-react";
import { api } from "../api/client.js";

const PLAN_FEATURES = {
  starter: {
    label: "Starter",
    color: "#6b7280",
    features: ["100 leads / month", "SMS conversations", "AI lead qualification", "Email notifications"],
    missing: ["AI voice calls", "Multiple locations", "API access"]
  },
  pro: {
    label: "Pro",
    color: "#2563eb",
    features: ["500 leads / month", "SMS conversations", "AI voice calls", "AI lead qualification", "Email notifications"],
    missing: ["Multiple locations", "API access"]
  },
  scale: {
    label: "Scale",
    color: "#7c3aed",
    features: ["Unlimited leads", "SMS conversations", "AI voice calls", "AI lead qualification", "Multiple locations", "Email notifications", "API access"],
    missing: []
  }
};

function UsageBar({ used, limit, isUnlimited }) {
  if (isUnlimited) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: "0.35rem 0" }}>
        <div style={{ flex: 1, height: 8, background: "#e5e7eb", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ width: "100%", height: "100%", background: "linear-gradient(90deg,#2563eb,#7c3aed)", borderRadius: 99 }} />
        </div>
        <span style={{ fontSize: "0.8rem", color: "#6b7280", whiteSpace: "nowrap" }}>Unlimited</span>
      </div>
    );
  }
  const pct = Math.min((used / limit) * 100, 100);
  const color = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#2563eb";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: "0.35rem 0" }}>
      <div style={{ flex: 1, height: 8, background: "#e5e7eb", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.4s ease" }} />
      </div>
      <span style={{ fontSize: "0.8rem", color: "#6b7280", whiteSpace: "nowrap" }}>{used} / {limit}</span>
    </div>
  );
}

function SubscriptionPanel() {
  const [usage, setUsage] = useState(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState("");

  useEffect(() => {
    api("/api/payments/usage").then(setUsage).catch(() => {});
  }, []);

  async function openPortal() {
    setPortalError("");
    setPortalLoading(true);
    try {
      const { url } = await api("/api/payments/portal", { method: "POST" });
      window.location.href = url;
    } catch (err) {
      setPortalError(err.message || "Could not open billing portal. Try again.");
      setPortalLoading(false);
    }
  }

  if (!usage) return null;

  const { plan, subscriptionStatus, leadsThisMonth, leadsLimit, voice } = usage;
  const info = PLAN_FEATURES[plan] || PLAN_FEATURES.starter;
  const isUnlimited = !leadsLimit || leadsLimit >= 1e10;
  const remaining = isUnlimited ? null : leadsLimit - leadsThisMonth;
  const pct = isUnlimited ? 0 : (leadsThisMonth / leadsLimit) * 100;

  const statusColor = subscriptionStatus === "active" ? "#16a34a" : subscriptionStatus === "past_due" ? "#b45309" : "#ef4444";
  const statusLabel = subscriptionStatus === "active" ? "Active" : subscriptionStatus === "past_due" ? "Past due" : "Inactive";

  return (
    <div className="panel" style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h2 style={{ margin: "0 0 4px" }}>Subscription</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ display: "inline-block", background: `${info.color}18`, color: info.color, border: `1px solid ${info.color}40`, borderRadius: 6, padding: "2px 10px", fontSize: "0.8rem", fontWeight: 700, textTransform: "capitalize" }}>
              {info.label}
            </span>
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: statusColor }}>{statusLabel}</span>
          </div>
        </div>
        <button
          className="button"
          onClick={openPortal}
          disabled={portalLoading}
          style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
        >
          <Zap size={15} />
          {portalLoading ? "Opening…" : "Manage billing"}
        </button>
      </div>

      {subscriptionStatus === "past_due" && (
        <p style={{ marginTop: 10, padding: "0.6rem 0.85rem", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, fontSize: "0.85rem", color: "#92400e" }}>
          Your last payment failed. Please update your payment method to keep your account active.
        </p>
      )}

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: "0.85rem", color: "#374151", fontWeight: 600, marginBottom: 6 }}>Leads this month</div>
        <UsageBar used={leadsThisMonth} limit={leadsLimit} isUnlimited={isUnlimited} />
        {!isUnlimited && (
          <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: pct >= 90 ? "#ef4444" : pct >= 70 ? "#b45309" : "#6b7280" }}>
            {pct >= 100 ? "Monthly limit reached — upgrade to capture more leads." : `${remaining} lead${remaining === 1 ? "" : "s"} remaining this month`}
          </p>
        )}
      </div>

      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.3rem 1.5rem" }}>
        {info.features.map((f) => (
          <div key={f} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.84rem", color: "#16a34a" }}>
            <CheckCircle size={14} /> {f}
          </div>
        ))}
        {info.missing.map((f) => (
          <div key={f} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.84rem", color: "#9ca3af" }}>
            <CheckCircle size={14} style={{ opacity: 0.3 }} /> {f}
          </div>
        ))}
      </div>

      {portalError && <p style={{ marginTop: 10, color: "#ef4444", fontSize: "0.85rem" }}>{portalError}</p>}

      <p style={{ marginTop: 14, fontSize: "0.78rem", color: "#9ca3af" }}>
        Manage billing, upgrade, downgrade, or cancel via the billing portal. Subscriptions auto-renew monthly — you'll receive a reminder email before each renewal.
      </p>
    </div>
  );
}

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: "", identifier: "", password: "", role: "staff" });
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "" });
  const [msg, setMsg] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  async function loadUsers() {
    const data = await api("/api/auth/users");
    setUsers(data.users);
  }

  useEffect(() => { loadUsers(); }, []);

  async function addUser(e) {
    e.preventDefault();
    setMsg("");
    try {
      await api("/api/auth/users", { method: "POST", body: form });
      setForm({ name: "", identifier: "", password: "", role: "staff" });
      setMsg("User added.");
      await loadUsers();
    } catch (err) { setMsg(err.message); }
  }

  async function removeUser(id) {
    if (!confirm("Remove this user?")) return;
    await api(`/api/auth/users/${id}`, { method: "DELETE" });
    await loadUsers();
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwMsg("");
    try {
      await api("/api/auth/password", { method: "PATCH", body: pwForm });
      setPwForm({ currentPassword: "", newPassword: "" });
      setPwMsg("Password updated.");
    } catch (err) { setPwMsg(err.message); }
  }

  return (
    <>
      <h2>Team access</h2>
      <div className="user-list">
        {users.map((u) => (
          <div className="user-row" key={u.id}>
            <div>
              <strong>{u.name || "Unnamed"}</strong>
              <span className="muted"> · {u.phoneNumber || u.email} · {u.role}</span>
            </div>
            <button className="ghost small" onClick={() => removeUser(u.id)}>Remove</button>
          </div>
        ))}
      </div>

      <h3>Add user</h3>
      <form className="settings-form" onSubmit={addUser}>
        <div className="form-grid">
          <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Phone or email<input value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} placeholder="+13175550000" required /></label>
          <label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
          <label>Role
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="owner">Owner</option>
              <option value="staff">Staff</option>
            </select>
          </label>
        </div>
        {msg && <p className={msg.includes("added") ? "success" : "error"}>{msg}</p>}
        <button className="button" type="submit">Add user</button>
      </form>

      <h2>Change your password</h2>
      <form className="settings-form" onSubmit={changePassword}>
        <div className="form-grid">
          <label>Current password<input type="password" value={pwForm.currentPassword} onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })} required /></label>
          <label>New password<input type="password" value={pwForm.newPassword} onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} required /></label>
        </div>
        {pwMsg && <p className={pwMsg.includes("updated") ? "success" : "error"}>{pwMsg}</p>}
        <button className="button" type="submit">Update password</button>
      </form>
    </>
  );
}

const defaultAvailability = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startTime: "09:00",
  endTime: "17:00",
  slotMinutes: 60
}));

export default function Settings() {
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api("/api/business/settings").then(({ business }) => {
      setForm({
        ...business,
        serviceAreasText: business.serviceAreas.join(", "),
        serviceTypesText: business.serviceTypes.map((type) => type.name).join(", "),
        availability: business.availability.length ? business.availability : defaultAvailability
      });
    });
  }, []);

  function setField(field, value) {
    setForm({ ...form, [field]: value });
  }

  function updateAvailability(index, field, value) {
    const availability = [...form.availability];
    availability[index] = { ...availability[index], [field]: value };
    setField("availability", availability);
  }

  async function submit(event) {
    event.preventDefault();
    setSaved(false);
    await api("/api/business/settings", {
      method: "PUT",
      body: {
        name: form.name,
        industryType: form.industryType,
        twilioPhoneNumber: form.twilioPhoneNumber,
        businessPhoneNumber: form.businessPhoneNumber,
        ownerNotificationPhone: form.ownerNotificationPhone,
        ownerNotificationEmail: form.ownerNotificationEmail,
        serviceAreas: form.serviceAreasText.split(",").map((item) => item.trim()).filter(Boolean),
        serviceTypes: form.serviceTypesText.split(",").map((item) => item.trim()).filter(Boolean),
        businessHours: form.businessHours,
        availability: form.availability
      }
    });
    setSaved(true);
  }

  if (!form) return <div className="page"><h1>Settings</h1><p>Loading...</p></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Business profile</p>
          <h1>Settings</h1>
        </div>
      </div>
      <SubscriptionPanel />
      <form className="panel settings-form" onSubmit={submit}>
        <div className="form-grid">
          <label>Business name<input value={form.name || ""} onChange={(e) => setField("name", e.target.value)} /></label>
          <label>Industry type<input value={form.industryType || ""} onChange={(e) => setField("industryType", e.target.value)} /></label>
          <label>Twilio phone number<input value={form.twilioPhoneNumber || ""} onChange={(e) => setField("twilioPhoneNumber", e.target.value)} /></label>
          <label>Business phone<input value={form.businessPhoneNumber || ""} onChange={(e) => setField("businessPhoneNumber", e.target.value)} /></label>
          <label>Owner notification phone<input value={form.ownerNotificationPhone || ""} onChange={(e) => setField("ownerNotificationPhone", e.target.value)} /></label>
          <label>Owner notification email<input value={form.ownerNotificationEmail || ""} onChange={(e) => setField("ownerNotificationEmail", e.target.value)} /></label>
        </div>
        <label>Service areas<input value={form.serviceAreasText} onChange={(e) => setField("serviceAreasText", e.target.value)} /></label>
        <label>Service types<input value={form.serviceTypesText} onChange={(e) => setField("serviceTypesText", e.target.value)} /></label>
        <h2>Appointment availability</h2>
        <div className="availability-list">
          {form.availability.map((slot, index) => (
            <div className="availability-row" key={`${slot.dayOfWeek}-${index}`}>
              <label>Day<input type="number" min="0" max="6" value={slot.dayOfWeek} onChange={(e) => updateAvailability(index, "dayOfWeek", e.target.value)} /></label>
              <label>Start<input type="time" value={slot.startTime} onChange={(e) => updateAvailability(index, "startTime", e.target.value)} /></label>
              <label>End<input type="time" value={slot.endTime} onChange={(e) => updateAvailability(index, "endTime", e.target.value)} /></label>
              <label>Minutes<input type="number" min="30" value={slot.slotMinutes} onChange={(e) => updateAvailability(index, "slotMinutes", e.target.value)} /></label>
            </div>
          ))}
        </div>
        {saved && <p className="success">Settings saved.</p>}
        <button className="button" type="submit">Save settings</button>
      </form>
      <div className="panel" style={{ marginTop: 18 }}>
        <UserManagement />
      </div>
    </div>
  );
}
