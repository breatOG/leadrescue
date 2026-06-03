import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, MessageSquare, Phone, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { api, getCache, setCache, getUser } from "../api/client.js";

const PLAN_FEATURES = {
  starter: {
    label: "Starter",
    color: "#6b7280",
    features: ["100 leads / month", "Unlimited SMS conversations", "AI lead qualification", "Auto-assigned local number", "Email & SMS notifications", "Appointment booking"],
    missing: ["AI voice calls", "Choose your phone number", "Multiple locations", "API access"]
  },
  pro: {
    label: "Pro",
    color: "#2563eb",
    features: ["500 leads / month", "Unlimited SMS conversations", "AI voice calls", "AI lead qualification", "Choose your own local number", "Email & SMS notifications", "Appointment booking", "Click-to-call customers"],
    missing: ["Multiple locations", "API access"]
  },
  scale: {
    label: "Scale",
    color: "#7c3aed",
    features: ["Unlimited leads", "Unlimited SMS conversations", "AI voice calls", "AI lead qualification", "Choose your own local number", "Multiple locations", "Email & SMS notifications", "Appointment booking", "Click-to-call customers", "API access"],
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

const PLAN_CARDS = [
  { key: "starter", label: "Starter", price: 79,  highlights: ["100 leads / mo", "SMS AI", "Auto number"] },
  { key: "pro",     label: "Pro",     price: 199, highlights: ["500 leads / mo", "SMS + Voice AI", "Pick your number"] },
  { key: "scale",   label: "Scale",   price: 399, highlights: ["Unlimited leads", "Everything", "Pick your number"] },
];

function SubscriptionPanel() {
  const [usage, setUsage] = useState(() => getCache("usage"));
  const [portalLoading, setPortalLoading] = useState(false);
  const [switching, setSwitching] = useState(null);
  const [msg, setMsg] = useState("");
  const [msgOk, setMsgOk] = useState(false);

  useEffect(() => { api("/api/payments/usage").then((d) => { setUsage(d); setCache("usage", d); }).catch(() => {}); }, []);

  async function openPortal() {
    setMsg(""); setPortalLoading(true);
    try {
      const { url } = await api("/api/payments/portal", { method: "POST" });
      window.location.href = url;
    } catch (err) {
      setMsg(err.message || "Could not open billing portal.");
      setPortalLoading(false);
    }
  }

  async function switchPlan(planKey) {
    setMsg(""); setSwitching(planKey);
    try {
      await api("/api/payments/change-plan", { method: "POST", body: { plan: planKey } });
      setMsg(`Switched to ${planKey} plan.`); setMsgOk(true);
      const d = await api("/api/payments/usage");
      setUsage(d);
    } catch (err) {
      // If no subscription yet, fall through to subscribe flow
      if (err.message?.includes("No active subscription")) {
        const { url } = await api("/api/payments/subscribe", { method: "POST", body: { plan: planKey } });
        window.location.href = url;
      } else {
        setMsg(err.message); setMsgOk(false);
      }
    } finally { setSwitching(null); }
  }

  if (!usage) return null;

  const { plan, subscriptionStatus, leadsThisMonth, leadsLimit, renewsAt, voice, numberType } = usage;
  const info = PLAN_FEATURES[plan] || PLAN_FEATURES.starter;
  const isUnlimited = !leadsLimit || leadsLimit >= 1e10;
  const pct = isUnlimited ? 0 : (leadsThisMonth / leadsLimit) * 100;
  const remaining = isUnlimited ? null : leadsLimit - leadsThisMonth;
  const statusOk = subscriptionStatus === "active";

  const renewsDate = renewsAt ? new Date(renewsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null;

  return (
    <div className="panel" style={{ marginBottom: 18 }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: "0 0 6px" }}>Subscription</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ background: `${info.color}15`, color: info.color, border: `1px solid ${info.color}35`, borderRadius: 6, padding: "2px 10px", fontSize: "0.78rem", fontWeight: 800, textTransform: "capitalize" }}>{info.label}</span>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: statusOk ? "#16a34a" : "#ef4444" }}>{statusOk ? "Active" : subscriptionStatus === "past_due" ? "Past due" : "Inactive"}</span>
            {renewsDate && statusOk && (
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Renews {renewsDate}</span>
            )}
          </div>
        </div>
        <button className="ghost" onClick={openPortal} disabled={portalLoading} style={{ fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 5 }}>
          <Zap size={13} />{portalLoading ? "Opening…" : "Billing portal"}
        </button>
      </div>

      {subscriptionStatus === "past_due" && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 10, fontSize: "0.84rem", color: "#92400e" }}>
          Your last payment failed. Update your payment method in the billing portal to keep access.
        </div>
      )}

      {/* Usage grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
        {/* Leads */}
        <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Leads this month</div>
          <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "#0f172a" }}>
            {leadsThisMonth}<span style={{ fontSize: "0.8rem", fontWeight: 500, color: "#94a3b8" }}>{isUnlimited ? "" : ` / ${leadsLimit}`}</span>
          </div>
          <UsageBar used={leadsThisMonth} limit={leadsLimit} isUnlimited={isUnlimited} />
          {!isUnlimited && pct >= 70 && (
            <p style={{ margin: "4px 0 0", fontSize: "0.76rem", color: pct >= 100 ? "#ef4444" : "#b45309", fontWeight: 600 }}>
              {pct >= 100 ? "Limit reached" : `${remaining} remaining`}
            </p>
          )}
        </div>

        {/* Limits summary */}
        <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Plan limits</div>
          {[
            { label: "SMS conversations", ok: true },
            { label: "AI voice calls", ok: !!voice },
            { label: numberType === "choose" ? "Choose your number" : "Auto-assigned number", ok: true },
            { label: "Appointment booking", ok: true },
          ].map(({ label, ok }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.79rem", color: ok ? "#374151" : "#cbd5e1" }}>
              <CheckCircle size={11} style={{ flexShrink: 0, color: ok ? "#16a34a" : "#d1d5db" }} />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Included features */}
      <div className="m-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 20px", marginBottom: 22 }}>
        {info.features.map((f) => (
          <div key={f} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.8rem", color: "#16a34a" }}>
            <CheckCircle size={12} style={{ flexShrink: 0 }} />{f}
          </div>
        ))}
        {info.missing.map((f) => (
          <div key={f} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.8rem", color: "#cbd5e1" }}>
            <CheckCircle size={12} style={{ flexShrink: 0, opacity: 0.35 }} />{f}
          </div>
        ))}
      </div>

      {/* Plan switcher */}
      <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 18 }}>
        <p style={{ margin: "0 0 12px", fontSize: "0.78rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Change plan</p>
        <div className="m-plans" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {PLAN_CARDS.map((pc) => {
            const isCurrent = plan === pc.key;
            return (
              <div key={pc.key} style={{ border: `1.5px solid ${isCurrent ? "var(--accent)" : "#e5e7eb"}`, borderRadius: 12, padding: "14px 14px 12px", background: isCurrent ? "#f0fdf9" : "#fff", position: "relative" }}>
                {isCurrent && <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: "var(--accent)", color: "#fff", fontSize: "0.65rem", fontWeight: 800, padding: "2px 10px", borderRadius: 99, whiteSpace: "nowrap" }}>Current</div>}
                <div style={{ fontWeight: 800, fontSize: "0.88rem", color: "#0f172a" }}>{pc.label}</div>
                <div style={{ fontSize: "1.2rem", fontWeight: 900, color: isCurrent ? "var(--accent)" : "#0f172a", margin: "4px 0" }}>${pc.price}<span style={{ fontSize: "0.72rem", fontWeight: 500, color: "#94a3b8" }}>/mo</span></div>
                {pc.highlights.map((h) => <div key={h} style={{ fontSize: "0.73rem", color: "#64748b", marginBottom: 2 }}>• {h}</div>)}
                <button
                  onClick={() => switchPlan(pc.key)}
                  disabled={isCurrent || !!switching}
                  style={{ marginTop: 10, width: "100%", padding: "7px 0", borderRadius: 8, border: isCurrent ? "none" : "1px solid var(--line)", background: isCurrent ? "var(--accent)" : "#f8fafc", color: isCurrent ? "#fff" : "#374151", fontWeight: 700, fontSize: "0.78rem", cursor: isCurrent ? "default" : "pointer", transition: "all 0.15s", opacity: (switching && switching !== pc.key) ? 0.5 : 1 }}
                  onMouseEnter={e => { if (!isCurrent) { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "var(--accent)"; }}}
                  onMouseLeave={e => { if (!isCurrent) { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.color = "#374151"; e.currentTarget.style.borderColor = "var(--line)"; }}}
                >
                  {isCurrent ? "Current plan" : switching === pc.key ? "Switching…" : `Switch to ${pc.label}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {msg && <p style={{ marginTop: 12, fontSize: "0.83rem", color: msgOk ? "#16a34a" : "#ef4444", fontWeight: 600 }}>{msg}</p>}
      <p style={{ marginTop: 12, fontSize: "0.76rem", color: "#94a3b8" }}>
        Plans switch immediately with proration. To update your payment method or cancel, use the billing portal.
        {renewsDate && statusOk && ` Your subscription auto-renews on ${renewsDate}.`}
      </p>
    </div>
  );
}

// Formats E.164 → (317) 555-0100
function fmt(e164) {
  const d = (e164 || "").replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  return e164;
}

function TwilioPhonePanel({ currentNumber, onNumberAssigned }) {
  const plan = (getUser()?.subscriptionPlan || "starter").toLowerCase();
  const isPremium = ["pro", "scale"].includes(plan);

  const [syncing, setSyncing] = useState(false);
  const [changing, setChanging] = useState(false); // show picker for existing premium users
  const [zip, setZip] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [selecting, setSelecting] = useState(null);
  const [msg, setMsg] = useState("");

  async function resync() {
    setSyncing(true); setMsg("");
    try {
      await api("/api/business/reconfigure-webhooks", { method: "POST" });
      setMsg("Webhooks re-synced.");
    } catch (err) { setMsg(err.message); }
    finally { setSyncing(false); }
  }

  async function searchZip(e) {
    e.preventDefault(); setMsg(""); setResults(null);
    if (!/^\d{5}$/.test(zip)) { setMsg("Enter a 5-digit ZIP code."); return; }
    setSearching(true);
    try {
      const data = await api(`/api/business/numbers-by-zip?zip=${zip}`);
      setResults(data.numbers);
      if (!data.numbers?.length) setMsg(data.hint || "No numbers available near that ZIP. Try a nearby one.");
    } catch (err) { setMsg(err.message); }
    finally { setSearching(false); }
  }

  async function selectNumber(phoneNumber) {
    setSelecting(phoneNumber); setMsg("");
    try {
      const data = await api("/api/business/select-number", { method: "POST", body: { phoneNumber } });
      onNumberAssigned(data.phoneNumber);
      setResults(null); setZip(""); setChanging(false);
      setMsg(`${fmt(data.phoneNumber)} is now your LeadRescue number.`);
    } catch (err) { setMsg(err.message); }
    finally { setSelecting(null); }
  }

  // The ZIP picker UI — shared between "no number yet" and "change number" states
  function ZipPicker() {
    return (
      <div style={{ marginTop: 14 }}>
        <p style={{ fontSize: "0.84rem", color: "#374151", margin: "0 0 12px" }}>
          Enter a ZIP code near your business to see available local numbers.
        </p>
        <form onSubmit={searchZip} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
            placeholder="ZIP code (e.g. 46201)"
            maxLength={5}
            style={{ width: 180, padding: "0.5rem 0.75rem", border: "1px solid #d1d5db", borderRadius: 8, fontSize: "0.9rem" }}
          />
          <button className="button" type="submit" disabled={searching} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {searching ? "Searching…" : "Search"}
          </button>
          {changing && (
            <button type="button" className="ghost" onClick={() => { setChanging(false); setResults(null); setZip(""); setMsg(""); }}>
              Cancel
            </button>
          )}
        </form>

        {results && results.length > 0 && (
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
            {results.map((n) => (
              <div key={n.phoneNumber} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderBottom: "1px solid #f1f5f9" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{fmt(n.phoneNumber)}</div>
                  {n.locality && <div style={{ fontSize: "0.76rem", color: "#9ca3af" }}>{n.locality}, {n.region}</div>}
                </div>
                <button
                  className="button"
                  onClick={() => selectNumber(n.phoneNumber)}
                  disabled={!!selecting}
                  style={{ fontSize: "0.8rem", padding: "0.35rem 0.9rem" }}
                >
                  {selecting === n.phoneNumber ? "Selecting…" : "Choose this number"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="panel" style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <Phone size={18} style={{ color: "#2563eb" }} />
        <h2 style={{ margin: 0 }}>Your LeadRescue number</h2>
      </div>

      {currentNumber ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "1rem 1.1rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: "1.35rem", letterSpacing: "0.01em", color: "#0f172a" }}>{fmt(currentNumber)}</div>
              <div style={{ fontSize: "0.78rem", color: "#16a34a", marginTop: 3 }}>
                Customers call and text this number. It also shows as your caller ID when you call them.
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button className="ghost small" onClick={resync} disabled={syncing} style={{ fontSize: "0.76rem", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                <RefreshCw size={11} />{syncing ? "Syncing…" : "Re-sync"}
              </button>
              {isPremium && !changing && (
                <button className="ghost small" onClick={() => { setChanging(true); setMsg(""); }} style={{ fontSize: "0.76rem", whiteSpace: "nowrap" }}>
                  Change number
                </button>
              )}
            </div>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: "0.77rem", color: "#94a3b8", lineHeight: 1.5 }}>
            {isPremium
              ? "Pro/Scale: you can change your number at any time. Your current number goes back into the pool when you do."
              : "Starter: your number is assigned from the available pool and stays with your subscription."}
          </p>
          {isPremium && changing && <ZipPicker />}
        </>
      ) : isPremium ? (
        <>
          <div style={{ padding: "0.85rem 1rem", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, fontSize: "0.84rem", color: "#1e40af", marginBottom: 4 }}>
            <strong>Choose your local number.</strong> Search by ZIP code and pick any available number near your business.
          </div>
          <ZipPicker />
        </>
      ) : (
        <div style={{ padding: "1rem 1.1rem", background: "#f8fafc", border: "1px solid var(--line)", borderRadius: 10, fontSize: "0.84rem", color: "#64748b" }}>
          Your LeadRescue number is being assigned. It will appear here shortly — it will be a local number near your area code.
        </div>
      )}

      {msg && <p style={{ margin: "10px 0 0", fontSize: "0.8rem", color: msg.includes("re-synced") || msg.includes("now your") ? "#16a34a" : "#ef4444", fontWeight: 600 }}>{msg}</p>}
    </div>
  );
}

function SmsStatusPanel() {
  const [status, setStatus] = useState(() => getCache("smsStatus"));
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    api("/api/sms-registration").then((d) => { setStatus(d.smsStatus); setCache("smsStatus", d.smsStatus); }).catch(() => {});
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

const PERMS = [
  { key: "leads:view",    label: "View leads",       desc: "See the leads list and conversation details" },
  { key: "leads:message", label: "Send messages",    desc: "Send manual SMS messages to leads" },
  { key: "calendar:view", label: "View calendar",    desc: "See appointments and availability schedule" },
  { key: "settings:view", label: "View settings",    desc: "View business settings (not billing or team)" },
];

function MemberRow({ user: u, onRemove, onPermissionsChange }) {
  const [expanded, setExpanded] = useState(false);
  const [perms, setPerms] = useState(u.permissions || []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const isOwner = u.role === "owner";

  function toggle(key) {
    setPerms((p) => p.includes(key) ? p.filter((k) => k !== key) : [...p, key]);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      await api(`/api/auth/users/${u.id}/permissions`, { method: "PATCH", body: { permissions: perms } });
      onPermissionsChange(u.id, perms);
      setSaved(true);
    } catch {}
    finally { setSaving(false); }
  }

  const avatar = (u.name || u.email || "?")[0].toUpperCase();

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: isOwner ? "linear-gradient(135deg,#0f766e,#115e59)" : "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", color: isOwner ? "#fff" : "#475569", fontWeight: 800, fontSize: "0.85rem", flexShrink: 0 }}>
            {avatar}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{u.name || "Unnamed"}</div>
            <div style={{ fontSize: "0.76rem", color: "var(--muted)" }}>{u.email} · <span style={{ textTransform: "capitalize", fontWeight: 600, color: isOwner ? "#0f766e" : "#475569" }}>{u.role}</span></div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {!isOwner && (
            <>
              <button
                className="ghost small"
                onClick={() => setExpanded((e) => !e)}
                style={{ fontSize: "0.78rem", color: "var(--accent)", borderColor: "var(--accent)" }}
              >
                {expanded ? "Hide permissions" : "Edit permissions"}
              </button>
              <button
                className="ghost small"
                onClick={() => onRemove(u.id)}
                style={{ fontSize: "0.78rem", color: "#ef4444", borderColor: "#fecaca" }}
              >
                Remove
              </button>
            </>
          )}
          {isOwner && <span style={{ fontSize: "0.75rem", color: "#0f766e", fontWeight: 700, background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "2px 10px", borderRadius: 99 }}>Owner · Full access</span>}
        </div>
      </div>

      {expanded && !isOwner && (
        <div style={{ padding: "14px 16px", background: "#f9fafb", borderTop: "1px solid var(--line)" }}>
          <p style={{ margin: "0 0 12px", fontSize: "0.8rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Permissions</p>
          <div className="m-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            {PERMS.map(({ key, label, desc }) => {
              const on = perms.includes(key);
              return (
                <label key={key} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", border: `1px solid ${on ? "#0f766e" : "var(--line)"}`, borderRadius: 8, background: on ? "#f0fdf4" : "#fff", cursor: "pointer", transition: "all 0.15s" }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(key)} style={{ marginTop: 2, accentColor: "#0f766e", width: 15, height: 15, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.83rem", color: on ? "#0f766e" : "#374151" }}>{label}</div>
                    <div style={{ fontSize: "0.74rem", color: "#94a3b8", marginTop: 1 }}>{desc}</div>
                  </div>
                </label>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="button" onClick={save} disabled={saving} style={{ fontSize: "0.82rem", minHeight: 34, padding: "0 14px" }}>
              {saving ? "Saving…" : "Save permissions"}
            </button>
            {saved && <span style={{ fontSize: "0.8rem", color: "#16a34a", fontWeight: 600 }}>Saved ✓</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function UserManagement() {
  const cachedTeam = getCache("team");
  const [users, setUsers] = useState(() => cachedTeam?.users || []);
  const [invitations, setInvitations] = useState(() => cachedTeam?.invitations || []);
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
    const u = ud.users || [], inv = id.invitations || [];
    setUsers(u);
    setInvitations(inv);
    setCache("team", { users: u, invitations: inv });
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
    if (!confirm("Remove this team member? They'll lose access immediately.")) return;
    await api(`/api/auth/users/${id}`, { method: "DELETE" });
    await load();
  }

  function updatePermissions(id, perms) {
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, permissions: perms } : u));
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
      {users.length === 0
        ? <p style={{ color: "var(--muted)", fontSize: "0.87rem" }}>No team members yet. Invite someone below.</p>
        : users.map((u) => (
            <MemberRow key={u.id} user={u} onRemove={removeUser} onPermissionsChange={updatePermissions} />
          ))
      }

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
        They'll get an email with a link to create their account. New members get view access to leads and calendar by default — you can adjust their permissions above.
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

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_FULL  = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SLOT_OPTIONS = [
  { value: 30,  label: "30 min" },
  { value: 45,  label: "45 min" },
  { value: 60,  label: "1 hour" },
  { value: 90,  label: "1.5 hours" },
  { value: 120, label: "2 hours" },
];

function AvailabilityEditor({ availability, onChange }) {
  const byDay = {};
  availability.forEach((slot, idx) => {
    const d = Number(slot.dayOfWeek);
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push({ ...slot, _idx: idx });
  });

  function toggleDay(day) {
    if (byDay[day]) {
      onChange(availability.filter((s) => Number(s.dayOfWeek) !== day));
    } else {
      onChange([...availability, { dayOfWeek: day, startTime: "09:00", endTime: "17:00", slotMinutes: 60 }]);
    }
  }

  function addBlock(day) {
    onChange([...availability, { dayOfWeek: day, startTime: "09:00", endTime: "12:00", slotMinutes: 60 }]);
  }

  function removeBlock(idx) {
    const next = availability.filter((_, i) => i !== idx);
    onChange(next);
  }

  function updateBlock(idx, field, value) {
    const next = [...availability];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
  }

  const activeDays = [1,2,3,4,5,6,0].filter((d) => !!byDay[d]);
  const inp = { padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 7, fontSize: "0.85rem", background: "#fff", color: "#0f172a" };

  return (
    <div>
      {/* Day pills */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 14 }}>
        {[1,2,3,4,5,6,0].map((day) => {
          const on = !!byDay[day];
          return (
            <button key={day} type="button" onClick={() => toggleDay(day)} style={{ padding: "5px 13px", borderRadius: 99, border: `1.5px solid ${on ? "var(--accent)" : "var(--line)"}`, background: on ? "var(--accent)" : "#fff", color: on ? "#fff" : "#64748b", fontWeight: 700, fontSize: "0.8rem", cursor: "pointer", transition: "all 0.12s" }}>
              {DAY_SHORT[day]}
            </button>
          );
        })}
      </div>

      {activeDays.length === 0 && (
        <p style={{ color: "#94a3b8", fontSize: "0.84rem", margin: "4px 0 0" }}>No days selected — click a day above to set hours.</p>
      )}

      {/* Compact table: one row per time block */}
      {activeDays.length > 0 && (
        <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 16px 1fr 110px 32px", gap: 8, padding: "6px 14px", background: "#f8fafc", borderBottom: "1px solid var(--line)", fontSize: "0.72rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", alignItems: "center" }}>
            <span>Day</span><span>Start</span><span></span><span>End</span><span>Slot size</span><span></span>
          </div>

          {activeDays.map((day, di) => (
            byDay[day].map((slot, bi) => (
              <div key={slot._idx} style={{ display: "grid", gridTemplateColumns: "80px 1fr 16px 1fr 110px 32px", gap: 8, padding: "8px 14px", borderBottom: di === activeDays.length - 1 && bi === byDay[day].length - 1 ? "none" : "1px solid #f1f5f9", alignItems: "center", background: bi % 2 === 1 ? "#fafafa" : "#fff" }}>
                <span style={{ fontWeight: 700, fontSize: "0.83rem", color: "#374151" }}>
                  {bi === 0 ? DAY_SHORT[day] : ""}
                </span>
                <input type="time" value={slot.startTime} onChange={(e) => updateBlock(slot._idx, "startTime", e.target.value)} style={inp} />
                <span style={{ textAlign: "center", color: "#94a3b8", fontSize: "0.8rem", fontWeight: 700 }}>–</span>
                <input type="time" value={slot.endTime} onChange={(e) => updateBlock(slot._idx, "endTime", e.target.value)} style={inp} />
                <select value={slot.slotMinutes} onChange={(e) => updateBlock(slot._idx, "slotMinutes", Number(e.target.value))} style={inp}>
                  {SLOT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button type="button" onClick={() => removeBlock(slot._idx)} title="Remove" style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #fecaca", background: "#fff", color: "#ef4444", cursor: "pointer", fontWeight: 800, fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
              </div>
            ))
          ))}

          {/* Add block row */}
          <div style={{ padding: "8px 14px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 6 }}>
            {activeDays.map((day) => (
              <button key={day} type="button" onClick={() => addBlock(day)} style={{ padding: "4px 10px", borderRadius: 7, border: "1.5px dashed #cbd5e1", background: "transparent", color: "#64748b", fontSize: "0.76rem", fontWeight: 700, cursor: "pointer" }}>
                + {DAY_SHORT[day]}
              </button>
            ))}
            <span style={{ fontSize: "0.74rem", color: "#94a3b8", alignSelf: "center", marginLeft: 4 }}>Add a split block (e.g. lunch break)</span>
          </div>
        </div>
      )}
    </div>
  );
}

const defaultAvailability = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek, startTime: "09:00", endTime: "17:00", slotMinutes: 60
}));

export default function Settings() {
  const [form, setForm] = useState(() => getCache("settingsForm"));
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    api("/api/business/settings")
      .then(({ business }) => {
        const next = {
          ...business,
          // Default the ring/alert mobile to the owner's login phone when not set yet.
          ownerNotificationPhone: business.ownerNotificationPhone || getUser()?.phoneNumber || "",
          serviceAreasText: business.serviceAreas.join(", "),
          serviceTypesText: business.serviceTypes.map((type) => type.name).join(", "),
          ringNumbersText: (business.ringNumbers || []).join(", "),
          availability: business.availability.length ? business.availability : defaultAvailability
        };
        setForm(next);
        setCache("settingsForm", next);
      })
      .catch((e) => setLoadError(e.message));
  }, []);

  function setField(field, value) {
    setForm({ ...form, [field]: value });
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
        callHandlingMode: form.callHandlingMode || "ring_first",
        ringSeconds: Number(form.ringSeconds) || 15,
        afterHoursRing: Boolean(form.afterHoursRing),
        ringNumbers: (form.ringNumbersText || "").split(",").map((n) => n.trim()).filter(Boolean),
        serviceAreas: form.serviceAreasText.split(",").map((item) => item.trim()).filter(Boolean),
        serviceTypes: form.serviceTypesText.split(",").map((item) => item.trim()).filter(Boolean),
        businessHours: form.businessHours,
        availability: form.availability
      }
    });
    setSaved(true);
  }

  if (loadError) return <div className="page"><h1>Settings</h1><p style={{ color: "#ef4444" }}>{loadError}</p></div>;
  if (!form) return (
    <div className="page">
      <div className="page-header"><div><p className="eyebrow">Business profile</p><h1>Settings</h1></div></div>
      {[160, 120, 120].map((h, i) => <div key={i} className="skeleton" style={{ height: h, borderRadius: 14, marginBottom: 18 }} />)}
    </div>
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Business profile</p>
          <h1>Settings</h1>
        </div>
      </div>
      <SubscriptionPanel />
      <TwilioPhonePanel currentNumber={form.twilioPhoneNumber} onNumberAssigned={(num) => setField("twilioPhoneNumber", num)} />
      <SmsStatusPanel />
      <form className="panel settings-form" onSubmit={submit}>
        {/* Business info */}
        <div style={{ marginBottom: 8 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: "1rem" }}>Business details</h2>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "#94a3b8" }}>Basic information about your business used by the AI.</p>
        </div>
        <div className="form-grid">
          <label>Business name<input value={form.name || ""} onChange={(e) => setField("name", e.target.value)} placeholder="Smith Plumbing LLC" /></label>
          <label>Industry type<input value={form.industryType || ""} onChange={(e) => setField("industryType", e.target.value)} placeholder="Plumbing Contractor" /></label>
          <label>
            Service areas
            <input value={form.serviceAreasText} onChange={(e) => setField("serviceAreasText", e.target.value)} placeholder="Indianapolis, Carmel, Fishers" />
            <span style={{ fontSize: "0.74rem", color: "#94a3b8", fontWeight: 400 }}>Comma-separated cities or ZIP codes</span>
          </label>
          <label>
            Service types
            <input value={form.serviceTypesText} onChange={(e) => setField("serviceTypesText", e.target.value)} placeholder="Burst pipe, Drain cleaning, Water heater" />
            <span style={{ fontSize: "0.74rem", color: "#94a3b8", fontWeight: 400 }}>Comma-separated — the AI uses these to qualify leads</span>
          </label>
        </div>

        <div style={{ height: 1, background: "var(--line)", margin: "8px 0" }} />

        {/* Notifications */}
        <div style={{ marginBottom: 8 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: "1rem" }}>Notifications</h2>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "#94a3b8" }}>Where to send alerts when the AI qualifies a new lead. Text alerts go to your mobile number (set under Call handling below).</p>
        </div>
        <div className="form-grid">
          <label>Alert email<input type="email" value={form.ownerNotificationEmail || ""} onChange={(e) => setField("ownerNotificationEmail", e.target.value)} placeholder="you@yourbusiness.com" /></label>
          <label>Business phone <span style={{ fontWeight: 400, color: "#94a3b8", fontSize: "0.78rem" }}>(for reference)</span><input value={form.businessPhoneNumber || ""} onChange={(e) => setField("businessPhoneNumber", e.target.value)} placeholder="+13175550100" /></label>
        </div>

        <div style={{ height: 1, background: "var(--line)", margin: "8px 0" }} />

        {/* Call handling */}
        <div style={{ marginBottom: 8 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: "1rem" }}>Call handling</h2>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "#94a3b8" }}>What happens when a customer calls your number.</p>
        </div>
        <div className="form-grid">
          <label>
            When a call comes in
            <select
              value={form.callHandlingMode || "ring_first"}
              onChange={(e) => setField("callHandlingMode", e.target.value)}
              style={{ width: "100%", padding: "11px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "#fff", fontSize: "0.95rem", color: "var(--ink)" }}
            >
              <option value="ring_first">Ring me first, then AI if I miss it</option>
              <option value="ai_immediately">AI answers immediately</option>
            </select>
          </label>
          <label>
            Ring my phone for
            <select
              value={form.ringSeconds || 15}
              onChange={(e) => setField("ringSeconds", Number(e.target.value))}
              style={{ width: "100%", padding: "11px 12px", border: "1px solid var(--line)", borderRadius: 8, background: "#fff", fontSize: "0.95rem", color: "var(--ink)" }}
            >
              <option value={10}>Short — 10 seconds</option>
              <option value={15}>Standard — 15 seconds</option>
              <option value={25}>Long — 25 seconds</option>
            </select>
          </label>
        </div>
        <label style={{ marginTop: 14 }}>
          Your mobile number <span style={{ fontWeight: 400, color: "#94a3b8", fontSize: "0.78rem" }}>(we ring this + send SMS alerts here)</span>
          <input value={form.ownerNotificationPhone || ""} onChange={(e) => setField("ownerNotificationPhone", e.target.value)} placeholder="+13175550100" />
          <span style={{ fontSize: "0.74rem", color: "#94a3b8", fontWeight: 400 }}>
            Defaults to your login number. Must be different from your business number{form.twilioPhoneNumber ? ` (${form.twilioPhoneNumber})` : ""} — that's the line customers call.
          </span>
        </label>
        <p style={{ margin: "10px 0 0", fontSize: "0.78rem", color: "#94a3b8", lineHeight: 1.5 }}>
          With <strong>"ring me first,"</strong> we ring your mobile{form.ownerNotificationPhone ? ` (${form.ownerNotificationPhone})` : ""} and ask you to press <strong>1</strong> to take the call. If you don't answer, decline, or it goes to voicemail, the AI receptionist picks up automatically.
          {!form.ownerNotificationPhone && <span style={{ color: "#b45309" }}> Add your mobile number above so we know where to ring you.</span>}
        </p>

        {(form.callHandlingMode || "ring_first") === "ring_first" && (
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 12, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={Boolean(form.afterHoursRing)}
              onChange={(e) => setField("afterHoursRing", e.target.checked)}
              style={{ width: 16, height: 16, marginTop: 2, accentColor: "var(--accent)", flexShrink: 0 }}
            />
            <span style={{ fontSize: "0.85rem", color: "#374151", fontWeight: 600 }}>
              Also ring me after hours
              <span style={{ display: "block", fontSize: "0.78rem", color: "#94a3b8", fontWeight: 400, marginTop: 2 }}>
                When off, calls outside your business hours go straight to the AI receptionist. Emergencies still alert you.
              </span>
            </span>
          </label>
        )}

        {(form.callHandlingMode || "ring_first") === "ring_first" && (
          <label style={{ marginTop: 12 }}>
            Also ring these team numbers <span style={{ fontWeight: 400, color: "#94a3b8", fontSize: "0.78rem" }}>(optional)</span>
            <input value={form.ringNumbersText || ""} onChange={(e) => setField("ringNumbersText", e.target.value)} placeholder="+13175550111, +13175550222" />
            <span style={{ fontSize: "0.74rem", color: "#94a3b8", fontWeight: 400 }}>Comma-separated. We ring everyone at once — whoever answers and presses 1 gets the call.</span>
          </label>
        )}

        <div style={{ height: 1, background: "var(--line)", margin: "12px 0 8px" }} />

        {/* Availability */}
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: "1rem" }}>Appointment availability</h2>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "#94a3b8" }}>The AI only offers slots that fall within these windows. Toggle days on/off and set your hours.</p>
        </div>
        <AvailabilityEditor
          availability={form.availability}
          onChange={(next) => setField("availability", next)}
        />

        {saved && <p className="success" style={{ margin: "8px 0 0" }}>Settings saved.</p>}
        <button className="button" type="submit" style={{ marginTop: 4 }}>Save settings</button>
      </form>
      <div className="panel" style={{ marginTop: 18 }}>
        <UserManagement />
      </div>
    </div>
  );
}
