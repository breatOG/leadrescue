import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Clock, MessageSquare, ShieldCheck, XCircle } from "lucide-react";
import { api } from "../api/client.js";
import { PhoneText, shouldRedactPhones } from "../components/RedactedPhone.jsx";

const STEPS = ["Business info", "Contact person", "Messaging details", "Review & submit"];

const BUSINESS_TYPES = [
  { value: "SOLE_PROPRIETORSHIP", label: "Sole proprietorship / Individual" },
  { value: "LLC", label: "LLC" },
  { value: "CORPORATION", label: "Corporation" },
  { value: "PARTNERSHIP", label: "Partnership" },
  { value: "CO_OPERATIVE", label: "Co-operative" },
  { value: "NON_PROFIT", label: "Non-profit" }
];

const INDUSTRIES = [
  { value: "CONSTRUCTION", label: "Construction" },
  { value: "ENGINEERING", label: "Engineering / Contracting" },
  { value: "REAL_ESTATE", label: "Real estate / Property" },
  { value: "HOME_AND_GARDEN", label: "Home services / Repair" },
  { value: "TRANSPORTATION", label: "Transportation / Logistics" },
  { value: "UTILITIES", label: "Utilities / HVAC / Plumbing" },
  { value: "RETAIL", label: "Retail" },
  { value: "LEGAL", label: "Legal services" },
  { value: "FINANCIAL", label: "Financial services" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "HEALTHCARE", label: "Healthcare" },
  { value: "OTHER", label: "Other" }
];

const USE_CASES = [
  { value: "CUSTOMER_CARE", label: "Customer care", desc: "Responding to missed calls, appointment reminders" },
  { value: "MIXED", label: "Mixed", desc: "Customer care + occasional promotions" },
  { value: "NOTIFICATIONS", label: "Notifications", desc: "Appointment confirmations, status updates only" }
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA",
  "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK",
  "OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
];

function StepIndicator({ current }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 28 }}>
      {STEPS.map((label, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : 0 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              background: i < current ? "#16a34a" : i === current ? "#2563eb" : "#e5e7eb",
              color: i <= current ? "#fff" : "#9ca3af",
              fontWeight: 700, fontSize: "0.82rem"
            }}>
              {i < current ? <CheckCircle size={14} /> : i + 1}
            </div>
            <span style={{ fontSize: "0.7rem", fontWeight: i === current ? 700 : 400, color: i === current ? "#2563eb" : "#9ca3af", whiteSpace: "nowrap" }}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div style={{ flex: 1, height: 2, background: i < current ? "#16a34a" : "#e5e7eb", margin: "0 4px", marginBottom: 20 }} />
          )}
        </div>
      ))}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>{label}</span>
      {hint && <span style={{ fontSize: "0.76rem", color: "#6b7280", marginTop: -2 }}>{hint}</span>}
      {children}
    </label>
  );
}

const inputStyle = { padding: "0.5rem 0.75rem", border: "1px solid #d1d5db", borderRadius: 8, fontSize: "0.9rem", width: "100%", boxSizing: "border-box" };
const selectStyle = { ...inputStyle, background: "#fff" };
const textareaStyle = { ...inputStyle, minHeight: 80, resize: "vertical" };

function StatusScreen({ status, steps, onRetry, onDone }) {
  const icons = {
    platform: <ShieldCheck size={40} style={{ color: "#16a34a" }} />,
    pending: <Clock size={40} style={{ color: "#f59e0b" }} />,
    approved: <ShieldCheck size={40} style={{ color: "#16a34a" }} />,
    failed: <XCircle size={40} style={{ color: "#ef4444" }} />
  };

  const titles = {
    platform: "You're covered by the LeadRescue platform",
    pending: "Submitted for verification",
    approved: "SMS verified!",
    failed: "Submission issue"
  };

  const descriptions = {
    platform: "LeadRescue's platform SMS campaign is already registered and active. Your messages are fully compliant with US carriers — no additional setup required on your end.",
    pending: "Your A2P 10DLC registration has been submitted to Twilio and the carrier network. Approval typically takes 1–3 business days. You'll be able to send SMS normally once approved. Check back here for updates.",
    approved: "Your SMS registration is approved. Your Twilio number can now send and receive messages to customers without carrier filtering.",
    failed: "Something went wrong during submission. Review the details below and try again, or contact Twilio support."
  };

  return (
    <div style={{ textAlign: "center", padding: "2rem 1rem" }}>
      <div style={{ marginBottom: 16 }}>{icons[status] || icons.pending}</div>
      <h2 style={{ marginTop: 0 }}>{titles[status]}</h2>
      <p style={{ color: "#6b7280", maxWidth: 480, margin: "0 auto 20px", lineHeight: 1.6 }}>
        {descriptions[status]}
      </p>

      {steps?.length > 0 && (
        <div style={{ textAlign: "left", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "1rem", maxWidth: 500, margin: "0 auto 20px" }}>
          <div style={{ fontWeight: 600, fontSize: "0.82rem", marginBottom: 8, color: "#374151" }}>Submission log</div>
          {steps.map((s, i) => (
            <div key={i} style={{ fontSize: "0.8rem", color: "#6b7280", padding: "3px 0", borderBottom: "1px solid #f3f4f6" }}>
              {s}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        {status === "failed" && (
          <button className="button" onClick={onRetry}>Try again</button>
        )}
        <button className="ghost" onClick={onDone}>Back to settings</button>
      </div>
    </div>
  );
}

export default function SmsSetup() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { status, steps }
  const [refreshing, setRefreshing] = useState(false);

  const [form, setForm] = useState({
    businessLegalName: "", businessType: "LLC", ein: "", businessAddress: "",
    businessCity: "", businessState: "IN", businessZip: "", businessWebsite: "",
    businessIndustry: "CONSTRUCTION",
    contactFirstName: "", contactLastName: "", contactEmail: "", contactPhone: "",
    useCase: "CUSTOMER_CARE",
    // These will be overwritten by server prefill on mount — defaults are shown only if prefill fails
    campaignDescription: "",
    sampleMessage1: "", sampleMessage2: "", sampleMessage3: "", sampleMessage4: "", sampleMessage5: "",
    optInMessage: "", optOutMessage: "", helpMessage: "",
    optInDescription: ""
  });

  // Pre-fill from saved form data (or from business profile prefill if first time)
  // Also redirect to settings if the platform campaign already covers this account.
  useEffect(() => {
    api("/api/sms-registration").then((data) => {
      if (data.platformConfigured) {
        // Platform-level campaign covers all clients — no per-client wizard needed
        setResult({ status: "platform", steps: [] });
        return;
      }
      if (data.smsStatus === "pending" || data.smsStatus === "approved" || data.smsStatus === "failed") {
        setResult({ status: data.smsStatus, steps: [] });
      }
      if (data.smsFormData) {
        setForm((f) => ({ ...f, ...data.smsFormData }));
      } else if (data.prefill) {
        setForm((f) => ({ ...f, ...data.prefill }));
      }
    }).catch(() => {});
  }, []);

  // Regenerate help message when contact details change (only if user hasn't manually edited it)
  useEffect(() => {
    if (step === 2) {
      setForm((f) => {
        const name = f.businessLegalName || "[Business Name]";
        const phone = f.contactPhone || "[Phone]";
        const email = f.contactEmail || "[Email]";
        const autoHelp = `LeadRescue Support: For assistance, contact ${name}${phone !== "[Phone]" ? ` at ${phone}` : ""}${email !== "[Email]" ? ` or ${email}` : ""}. Msg & data rates may apply. Reply STOP to opt out.`;
        // Only overwrite if it still looks like an auto-generated value
        if (!f.helpMessage || f.helpMessage.startsWith("LeadRescue Support:")) {
          return { ...f, helpMessage: autoHelp };
        }
        return f;
      });
    }
  }, [step, form.contactPhone, form.contactEmail, form.businessLegalName]);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function submit() {
    setSubmitting(true);
    try {
      const data = await api("/api/sms-registration/submit", { method: "POST", body: form });
      setResult({ status: data.status || (data.ok ? "pending" : "failed"), steps: data.steps || [] });
    } catch (err) {
      setResult({ status: "failed", steps: [err.message] });
    } finally {
      setSubmitting(false);
    }
  }

  async function checkStatus() {
    setRefreshing(true);
    try {
      const data = await api("/api/sms-registration/refresh", { method: "POST" });
      setResult((r) => ({ ...r, status: data.smsStatus }));
    } catch {}
    finally { setRefreshing(false); }
  }

  if (result) {
    return (
      <div className="page">
        <div className="page-header"><div><p className="eyebrow">SMS compliance</p><h1>SMS verification</h1></div></div>
        <div className="panel">
          <StatusScreen
            status={result.status}
            steps={result.steps}
            onRetry={() => { setResult(null); setStep(0); }}
            onDone={() => navigate("/settings")}
          />
          {result.status === "pending" && (
            <div style={{ textAlign: "center", marginTop: 12 }}>
              <button className="ghost" onClick={checkStatus} disabled={refreshing} style={{ fontSize: "0.83rem" }}>
                {refreshing ? "Checking…" : "Check current status"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">SMS compliance · A2P 10DLC</p>
          <h1>SMS verification setup</h1>
        </div>
      </div>

      <div className="panel">
        <div style={{ padding: "0.75rem 1rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: "0.82rem", color: "#166534", marginBottom: 20 }}>
          <strong>Fully automated.</strong> Fill out the steps below and click Submit — we handle everything with Twilio automatically. No Twilio dashboard needed. Approval from carriers usually takes 1–3 business days.
        </div>
        <StepIndicator current={step} />

        {step === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <h2 style={{ marginTop: 0 }}>Business information</h2>
            <p style={{ color: "#6b7280", fontSize: "0.85rem", marginTop: -8 }}>
              We pre-filled what we know from your profile. Add your EIN and address, then continue.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label="Legal business name" hint="Exactly as registered with the government">
                <input style={inputStyle} value={form.businessLegalName} onChange={set("businessLegalName")} required placeholder="Smith Plumbing LLC" />
              </Field>
              <Field label="Business type">
                <select style={selectStyle} value={form.businessType} onChange={set("businessType")}>
                  {BUSINESS_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="EIN / Federal Tax ID" hint="Not required for sole proprietors">
                <input style={inputStyle} value={form.ein} onChange={set("ein")} placeholder="12-3456789" />
              </Field>
              <Field label="Industry">
                <select style={selectStyle} value={form.businessIndustry} onChange={set("businessIndustry")}>
                  {INDUSTRIES.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
                </select>
              </Field>
              <Field label="Business website">
                <input style={inputStyle} value={form.businessWebsite} onChange={set("businessWebsite")} placeholder="https://smithplumbing.com" />
              </Field>
            </div>
            <Field label="Street address">
              <input style={inputStyle} value={form.businessAddress} onChange={set("businessAddress")} placeholder="123 Main St" />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 14 }}>
              <Field label="City">
                <input style={inputStyle} value={form.businessCity} onChange={set("businessCity")} placeholder="Indianapolis" />
              </Field>
              <Field label="State">
                <select style={selectStyle} value={form.businessState} onChange={set("businessState")}>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="ZIP">
                <input style={inputStyle} value={form.businessZip} onChange={set("businessZip")} placeholder="46201" maxLength={10} />
              </Field>
            </div>
          </div>
        )}

        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <h2 style={{ marginTop: 0 }}>Contact person</h2>
            <p style={{ color: "#6b7280", fontSize: "0.85rem", marginTop: -8 }}>
              The person responsible for this messaging program. Carriers may use this for compliance questions.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Field label="First name">
                <input style={inputStyle} value={form.contactFirstName} onChange={set("contactFirstName")} placeholder="John" />
              </Field>
              <Field label="Last name">
                <input style={inputStyle} value={form.contactLastName} onChange={set("contactLastName")} placeholder="Smith" />
              </Field>
              <Field label="Email">
                <input style={inputStyle} type="email" value={form.contactEmail} onChange={set("contactEmail")} placeholder="john@smithplumbing.com" />
              </Field>
              <Field label="Phone">
                <input className={shouldRedactPhones() ? "redacted-phone-input" : ""} style={inputStyle} value={form.contactPhone} onChange={set("contactPhone")} placeholder="+13175550100" />
              </Field>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <h2 style={{ marginTop: 0 }}>Messaging details</h2>
            <p style={{ color: "#6b7280", fontSize: "0.85rem", marginTop: -8 }}>
              Carriers review this to verify your messages are legitimate business communications. Be specific and accurate.
            </p>

            <Field label="Message use case">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {USE_CASES.map((u) => (
                  <label key={u.value} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", border: `2px solid ${form.useCase === u.value ? "#2563eb" : "#e5e7eb"}`, borderRadius: 8, cursor: "pointer", background: form.useCase === u.value ? "#eff6ff" : "#fff" }}>
                    <input type="radio" name="useCase" value={u.value} checked={form.useCase === u.value} onChange={set("useCase")} style={{ marginTop: 2 }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>{u.label}</div>
                      <div style={{ fontSize: "0.78rem", color: "#6b7280" }}>{u.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </Field>

            <Field label="Campaign description" hint="Describe exactly what your messages are for (1–2 sentences)">
              <textarea style={textareaStyle} value={form.campaignDescription} onChange={set("campaignDescription")} />
            </Field>

            <Field label="Sample message 1" hint="Missed-call follow-up">
              <textarea style={{ ...textareaStyle, minHeight: 60 }} value={form.sampleMessage1} onChange={set("sampleMessage1")} />
            </Field>

            <Field label="Sample message 2" hint="Collecting job details">
              <textarea style={{ ...textareaStyle, minHeight: 60 }} value={form.sampleMessage2} onChange={set("sampleMessage2")} />
            </Field>

            <Field label="Sample message 3" hint="Urgency qualification">
              <textarea style={{ ...textareaStyle, minHeight: 60 }} value={form.sampleMessage3} onChange={set("sampleMessage3")} />
            </Field>

            <Field label="Sample message 4" hint="Appointment slot offer">
              <textarea style={{ ...textareaStyle, minHeight: 60 }} value={form.sampleMessage4} onChange={set("sampleMessage4")} />
            </Field>

            <Field label="Sample message 5" hint="Booking confirmation">
              <textarea style={{ ...textareaStyle, minHeight: 60 }} value={form.sampleMessage5} onChange={set("sampleMessage5")} />
            </Field>

            <Field label="Opt-in confirmation message" hint="Sent when a customer texts START">
              <textarea style={{ ...textareaStyle, minHeight: 60 }} value={form.optInMessage} onChange={set("optInMessage")} />
            </Field>

            <Field label="Opt-out message" hint="Sent when a customer texts STOP">
              <textarea style={{ ...textareaStyle, minHeight: 60 }} value={form.optOutMessage} onChange={set("optOutMessage")} />
            </Field>

            <Field label="Help message" hint="Sent when a customer texts HELP — auto-filled from your contact info">
              <textarea style={{ ...textareaStyle, minHeight: 60 }} value={form.helpMessage} onChange={set("helpMessage")} />
            </Field>

            <Field label="How customers opt in" hint="Describe how customers agree to receive messages from you">
              <textarea style={{ ...textareaStyle, minHeight: 80 }} value={form.optInDescription} onChange={set("optInDescription")} />
            </Field>

            <div style={{ padding: "0.75rem 1rem", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, fontSize: "0.8rem", color: "#1e40af" }}>
              <strong>Tip:</strong> Your messages must include a way to opt out (e.g. "Reply STOP to opt out"). LeadRescue already handles this in its default reply templates.
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <h2 style={{ marginTop: 0 }}>Review & submit</h2>
            <p style={{ color: "#6b7280", fontSize: "0.85rem", marginTop: -8 }}>
              Double-check everything below before submitting. Once submitted, changes require contacting Twilio.
            </p>

            {[
              { section: "Business", rows: [
                ["Legal name", form.businessLegalName],
                ["Type", form.businessType],
                ["EIN", form.ein || "Not provided"],
                ["Industry", form.businessIndustry],
                ["Website", form.businessWebsite],
                ["Address", `${form.businessAddress}, ${form.businessCity}, ${form.businessState} ${form.businessZip}`]
              ]},
              { section: "Contact", rows: [
                ["Name", `${form.contactFirstName} ${form.contactLastName}`],
                ["Email", form.contactEmail],
                ["Phone", form.contactPhone]
              ]},
              { section: "Messaging", rows: [
                ["Use case", form.useCase],
                ["Description", form.campaignDescription],
                ["Sample 1", form.sampleMessage1],
                ["Sample 2", form.sampleMessage2],
                ["Sample 3", form.sampleMessage3],
                ["Sample 4", form.sampleMessage4],
                ["Sample 5", form.sampleMessage5],
                ["Opt-in message", form.optInMessage],
                ["Opt-out message", form.optOutMessage],
                ["Help message", form.helpMessage],
                ["Opt-in method", form.optInDescription]
              ]}
            ].map(({ section, rows }) => (
              <div key={section} style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "8px 14px", background: "#f9fafb", fontWeight: 700, fontSize: "0.82rem", color: "#374151" }}>{section}</div>
                {rows.map(([label, value]) => (
                  <div key={label} style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 12, padding: "8px 14px", borderTop: "1px solid #f3f4f6", fontSize: "0.83rem" }}>
                    <span style={{ color: "#9ca3af", fontWeight: 600 }}>{label}</span>
                    <span style={{ color: "#111827", wordBreak: "break-word" }}>{label === "Phone" ? <PhoneText>{value}</PhoneText> : value}</span>
                  </div>
                ))}
              </div>
            ))}

            <div style={{ padding: "0.85rem 1rem", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, fontSize: "0.82rem", color: "#92400e" }}>
              By submitting, you confirm this information is accurate and complies with TCPA, CTIA, and carrier guidelines. We will automatically register your brand and campaign with Twilio — no Twilio dashboard needed. Approval typically takes <strong>1–3 business days</strong>.
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, paddingTop: 20, borderTop: "1px solid #f3f4f6" }}>
          <button className="ghost" onClick={() => step === 0 ? navigate("/settings") : setStep((s) => s - 1)}>
            {step === 0 ? "Cancel" : "← Back"}
          </button>
          {step < 3 ? (
            <button className="button" onClick={() => setStep((s) => s + 1)}>
              Next →
            </button>
          ) : (
            <button className="button" onClick={submit} disabled={submitting} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <MessageSquare size={15} />
              {submitting ? "Submitting to Twilio…" : "Submit for verification"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
