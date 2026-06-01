import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, MessageSquare, Phone, RefreshCw, Search, ShieldCheck, Zap } from "lucide-react";
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

function TwilioPhonePanel({ currentNumber, onProvisioned }) {
  const [tab, setTab] = useState("existing"); // "existing" | "new"
  const [existingInput, setExistingInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [areaCode, setAreaCode] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [provisioning, setProvisioning] = useState(null);
  const [reconfiguring, setReconfiguring] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  function clearMessages() { setError(""); setSuccess(""); }

  async function connectExisting(e) {
    e.preventDefault();
    clearMessages();
    if (!existingInput.trim()) { setError("Enter your Twilio phone number."); return; }
    setConnecting(true);
    try {
      const data = await api("/api/business/connect-existing-number", { method: "POST", body: { phoneNumber: existingInput.trim() } });
      onProvisioned(data.phoneNumber);
      setExistingInput("");
      setSuccess(`${data.phoneNumber} is connected. SMS and voice are now routed to your AI.`);
    } catch (err) { setError(err.message); }
    finally { setConnecting(false); }
  }

  async function search(e) {
    e.preventDefault();
    clearMessages(); setResults(null);
    if (!/^\d{3}$/.test(areaCode)) { setError("Enter a 3-digit area code."); return; }
    setSearching(true);
    try {
      const data = await api(`/api/business/available-numbers?areaCode=${areaCode}`);
      setResults(data.numbers);
      if (!data.numbers.length) setError("No numbers available in that area code. Try a different one.");
    } catch (err) { setError(err.message); }
    finally { setSearching(false); }
  }

  async function provision(phoneNumber) {
    clearMessages();
    setProvisioning(phoneNumber);
    try {
      const data = await api("/api/business/provision-phone", { method: "POST", body: { phoneNumber } });
      onProvisioned(data.phoneNumber);
      setResults(null); setAreaCode("");
      setSuccess(`${data.phoneNumber} is your LeadRescue number. Webhooks configured automatically.`);
    } catch (err) { setError(err.message); }
    finally { setProvisioning(null); }
  }

  async function reconfigure() {
    clearMessages(); setReconfiguring(true);
    try {
      await api("/api/business/reconfigure-webhooks", { method: "POST" });
      setSuccess("Webhooks re-synced — your number is pointed at this server.");
    } catch (err) { setError(err.message); }
    finally { setReconfiguring(false); }
  }

  const tabStyle = (active) => ({
    padding: "0.4rem 1rem", borderRadius: 7, border: "none", cursor: "pointer", fontSize: "0.84rem", fontWeight: 600,
    background: active ? "#2563eb" : "transparent", color: active ? "#fff" : "#6b7280", transition: "all 0.15s"
  });

  return (
    <div className="panel" style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Phone size={18} style={{ color: "#2563eb" }} />
        <h2 style={{ margin: 0 }}>Phone number</h2>
      </div>

      {/* Current number display */}
      {currentNumber && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, padding: "0.75rem 1rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 9 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: "1rem" }}>{currentNumber}</div>
            <div style={{ fontSize: "0.78rem", color: "#16a34a", marginTop: 2 }}>Active · calls and texts route to your AI</div>
          </div>
          <button className="ghost small" onClick={reconfigure} disabled={reconfiguring} style={{ fontSize: "0.78rem", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
            <RefreshCw size={12} /> {reconfiguring ? "Syncing…" : "Re-sync webhooks"}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, background: "#f3f4f6", borderRadius: 9, padding: 4, marginBottom: 16 }}>
        <button style={tabStyle(tab === "existing")} onClick={() => { setTab("existing"); clearMessages(); setResults(null); }}>
          Use my existing number
        </button>
        <button style={tabStyle(tab === "new")} onClick={() => { setTab("new"); clearMessages(); setResults(null); }}>
          Get a new number
        </button>
      </div>

      {tab === "existing" && (
        <div>
          <p style={{ fontSize: "0.84rem", color: "#374151", marginTop: 0, marginBottom: 12 }}>
            Already have a number in your Twilio account? Enter it below and we'll connect it instantly — no purchase needed.
          </p>
          <form onSubmit={connectExisting} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input
              value={existingInput}
              onChange={(e) => setExistingInput(e.target.value)}
              placeholder="+13175550100"
              style={{ flex: 1, padding: "0.5rem 0.75rem", border: "1px solid #d1d5db", borderRadius: 8, fontSize: "0.9rem" }}
            />
            <button className="button" type="submit" disabled={connecting} style={{ whiteSpace: "nowrap" }}>
              {connecting ? "Connecting…" : "Connect number"}
            </button>
          </form>
          <div style={{ padding: "0.75rem 1rem", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, fontSize: "0.8rem", color: "#1e40af" }}>
            <strong>Using your current business number?</strong> You can keep your existing phone number by porting it into Twilio (takes 2–7 days via Twilio support), or set up <strong>call forwarding</strong> from your current number to a LeadRescue number so missed calls still reach the AI.
          </div>
        </div>
      )}

      {tab === "new" && (
        <div>
          <p style={{ fontSize: "0.84rem", color: "#374151", marginTop: 0, marginBottom: 12 }}>
            Search for an available US number by area code. It will be purchased and configured automatically.
          </p>
          <form onSubmit={search} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
              placeholder="Area code (e.g. 317)"
              style={{ width: 170, padding: "0.5rem 0.75rem", border: "1px solid #d1d5db", borderRadius: 8, fontSize: "0.9rem" }}
            />
            <button className="button" type="submit" disabled={searching} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Search size={14} /> {searching ? "Searching…" : "Search"}
            </button>
          </form>

          {results && results.length > 0 && (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", marginBottom: 10 }}>
              {results.map((n) => (
                <div key={n.phoneNumber} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #f3f4f6" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>{n.friendlyName || n.phoneNumber}</div>
                    {n.locality && <div style={{ fontSize: "0.76rem", color: "#9ca3af" }}>{n.locality}, {n.region}</div>}
                  </div>
                  <button className="button" onClick={() => provision(n.phoneNumber)} disabled={!!provisioning} style={{ fontSize: "0.8rem", padding: "0.35rem 0.85rem" }}>
                    {provisioning === n.phoneNumber ? "Getting…" : "Get this number"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p style={{ color: "#ef4444", fontSize: "0.84rem", margin: "8px 0 0" }}>{error}</p>}
      {success && <p style={{ color: "#16a34a", fontSize: "0.84rem", margin: "8px 0 0" }}>{success}</p>}
    </div>
  );
}

function SmsStatusPanel() {
  const [status, setStatus] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    api("/api/sms-registration").then((d) => setStatus(d.smsStatus)).catch(() => {});
  }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      const d = await api("/api/sms-registration/refresh", { method: "POST" });
      setStatus(d.smsStatus);
    } catch {}
    finally { setRefreshing(false); }
  }

  const cfg = {
    not_started: { color: "#f59e0b", bg: "#fef3c7", border: "#fde68a", label: "Not set up", text: "SMS messages may be filtered by carriers until you complete A2P 10DLC verification. This is a US carrier requirement — it only takes a few minutes to submit." },
    submitting:  { color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", label: "Submitting…", text: "Your registration is being submitted to Twilio. This may take a moment." },
    pending:     { color: "#d97706", bg: "#fef3c7", border: "#fde68a", label: "Pending approval", text: "Your A2P 10DLC registration has been submitted. Carrier approval typically takes 1–3 business days. SMS will be fully unlocked once approved." },
    approved:    { color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", label: "SMS verified", text: "Your messaging registration is approved. SMS is fully unlocked — messages will not be filtered by carriers." },
    failed:      { color: "#ef4444", bg: "#fef2f2", border: "#fecaca", label: "Verification failed", text: "There was an issue with your registration. Please re-submit with corrected information." }
  };

  const c = cfg[status] || cfg.not_started;

  return (
    <div className="panel" style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <MessageSquare size={18} style={{ color: "#2563eb" }} />
          <h2 style={{ margin: 0 }}>SMS verification</h2>
        </div>
        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: c.color, background: c.bg, border: `1px solid ${c.border}`, padding: "2px 10px", borderRadius: 99 }}>
          {status === "approved" && <ShieldCheck size={11} style={{ marginRight: 4, verticalAlign: "middle" }} />}
          {c.label}
        </span>
      </div>

      <p style={{ fontSize: "0.84rem", color: "#374151", margin: "10px 0 14px", lineHeight: 1.55 }}>{c.text}</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {status !== "approved" && (
          <Link to="/sms-setup" className="button" style={{ fontSize: "0.84rem", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <MessageSquare size={13} />
            {status === "failed" ? "Re-submit verification" : "Set up SMS verification"}
          </Link>
        )}
        {(status === "pending" || status === "approved") && (
          <button className="ghost" onClick={refresh} disabled={refreshing} style={{ fontSize: "0.83rem" }}>
            {refreshing ? "Checking…" : "Refresh status"}
          </button>
        )}
      </div>
    </div>
  );
}

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteMsg, setInviteMsg] = useState("");
  const [inviting, setInviting] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "" });
  const [pwMsg, setPwMsg] = useState("");

  async function load() {
    const [ud, id] = await Promise.all([
      api("/api/auth/users").catch(() => ({ users: [] })),
      api("/api/invites").catch(() => ({ invitations: [] }))
    ]);
    setUsers(ud.users || []);
    setInvitations(id.invitations || []);
  }

  useEffect(() => { load(); }, []);

  async function sendInvite(e) {
    e.preventDefault();
    setInviteMsg(""); setInviting(true);
    try {
      await api("/api/invites", { method: "POST", body: { email: inviteEmail, name: inviteName } });
      setInviteEmail(""); setInviteName("");
      setInviteMsg("Invitation sent! They'll receive an email with a link to join.");
      await load();
    } catch (err) { setInviteMsg(err.message); }
    finally { setInviting(false); }
  }

  async function cancelInvite(id) {
    await api(`/api/invites/${id}`, { method: "DELETE" });
    await load();
  }

  async function removeUser(id) {
    if (!confirm("Remove this team member?")) return;
    await api(`/api/auth/users/${id}`, { method: "DELETE" });
    await load();
  }

  async function changePassword(e) {
    e.preventDefault(); setPwMsg("");
    try {
      await api("/api/auth/password", { method: "PATCH", body: pwForm });
      setPwForm({ currentPassword: "", newPassword: "" });
      setPwMsg("Password updated.");
    } catch (err) { setPwMsg(err.message); }
  }

  return (
    <>
      <h2>Team members</h2>
      <div className="user-list">
        {users.map((u) => (
          <div className="user-row" key={u.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #0f766e, #115e59)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: "0.82rem", flexShrink: 0 }}>
                {(u.name || u.email || "?")[0].toUpperCase()}
              </div>
              <div>
                <strong>{u.name || "Unnamed"}</strong>
                <div className="muted" style={{ fontSize: "0.8rem" }}>{u.email} · <span style={{ textTransform: "capitalize" }}>{u.role}</span></div>
              </div>
            </div>
            <button className="ghost small" onClick={() => removeUser(u.id)} style={{ fontSize: "0.8rem" }}>Remove</button>
          </div>
        ))}
      </div>

      {invitations.length > 0 && (
        <>
          <h3 style={{ marginTop: 20, marginBottom: 10 }}>Pending invitations</h3>
          <div className="user-list">
            {invitations.map((inv) => (
              <div className="user-row" key={inv.id} style={{ background: "#fffbeb", borderColor: "#fde68a" }}>
                <div>
                  <strong>{inv.name || inv.email}</strong>
                  <div className="muted" style={{ fontSize: "0.8rem" }}>{inv.email} · Invite sent — waiting to accept</div>
                </div>
                <button className="ghost small" onClick={() => cancelInvite(inv.id)} style={{ fontSize: "0.8rem" }}>Cancel</button>
              </div>
            ))}
          </div>
        </>
      )}

      <h3 style={{ marginTop: 22 }}>Invite a team member</h3>
      <p style={{ fontSize: "0.84rem", color: "#64748b", marginTop: 0, marginBottom: 14 }}>
        They'll receive an email with a link to create their account and access your dashboard.
      </p>
      <form className="settings-form" onSubmit={sendInvite}>
        <div className="form-grid">
          <label>Name <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optional)</span>
            <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Jane Smith" />
          </label>
          <label>Email address
            <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="jane@yourbusiness.com" required />
          </label>
        </div>
        {inviteMsg && <p className={inviteMsg.includes("sent") ? "success" : "error"}>{inviteMsg}</p>}
        <button className="button" type="submit" disabled={inviting}>{inviting ? "Sending…" : "Send invitation"}</button>
      </form>

      <h2 style={{ marginTop: 28 }}>Change your password</h2>
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
      <TwilioPhonePanel
        currentNumber={form.twilioPhoneNumber}
        onProvisioned={(num) => setField("twilioPhoneNumber", num)}
      />
      <SmsStatusPanel />
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
