import { useState } from "react";
import { api } from "../api/client.js";

export default function CustomInvoice() {
  const [form, setForm] = useState({ clientName: "", clientEmail: "", amount: "", description: "" });
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function generate(e) {
    e.preventDefault();
    setError("");
    setLink("");
    setLoading(true);
    try {
      const data = await api("/api/payments/custom-link", {
        method: "POST",
        body: form,
      });
      setLink(data.url);
    } catch (err) {
      setError(err.message || "Failed to generate link. Make sure STRIPE_SECRET_KEY is set.");
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function reset() {
    setLink("");
    setForm({ clientName: "", clientEmail: "", amount: "", description: "" });
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>Custom Invoice</h1>
        <p style={s.sub}>Generate a Stripe payment link for any amount — share it on-site or via text.</p>
      </div>

      <div style={s.layout}>
        {/* Form */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>Deal Details</h2>
          <form onSubmit={generate} style={s.form}>
            <label style={s.label}>
              Client Name
              <input style={s.input} value={form.clientName} onChange={set("clientName")} placeholder="John Smith" />
            </label>
            <label style={s.label}>
              Client Email <span style={s.optional}>(optional — for receipt)</span>
              <input style={s.input} type="email" value={form.clientEmail} onChange={set("clientEmail")} placeholder="john@example.com" />
            </label>
            <label style={s.label}>
              Amount (USD) <span style={s.required}>*</span>
              <div style={s.amountRow}>
                <span style={s.dollar}>$</span>
                <input
                  style={{ ...s.input, paddingLeft: "2rem" }}
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  value={form.amount}
                  onChange={set("amount")}
                  placeholder="0.00"
                />
              </div>
            </label>
            <label style={s.label}>
              Description
              <input style={s.input} value={form.description} onChange={set("description")} placeholder="AC repair — 1145 Helford Lane" />
            </label>
            {error && <div style={s.error}>{error}</div>}
            <button type="submit" style={s.btn} disabled={loading}>
              {loading ? "Generating…" : "Generate Payment Link →"}
            </button>
          </form>
        </div>

        {/* Result */}
        {link ? (
          <div style={s.resultCard}>
            <div style={s.resultIcon}>✓</div>
            <h3 style={s.resultTitle}>Payment Link Ready</h3>
            <p style={s.resultSub}>Share this link with your client — they can pay by card on any device.</p>
            <div style={s.linkBox}>
              <span style={s.linkText}>{link}</span>
            </div>
            <div style={s.resultActions}>
              <button style={s.copyBtn} onClick={copy}>
                {copied ? "✓ Copied!" : "Copy Link"}
              </button>
              <a style={s.openBtn} href={link} target="_blank" rel="noreferrer">
                Open in Stripe →
              </a>
            </div>
            <div style={s.amount}>
              ${Number(form.amount).toFixed(2)}
              {form.clientName && <span style={s.forName}> · {form.clientName}</span>}
            </div>
            <button style={s.newBtn} onClick={reset}>Create another</button>
          </div>
        ) : (
          <div style={s.tipCard}>
            <h3 style={s.tipTitle}>How it works</h3>
            <div style={s.tips}>
              {[
                ["1", "Fill in the deal details on the left"],
                ["2", "Click Generate — Stripe creates a secure checkout page"],
                ["3", "Copy the link and text or email it to your client"],
                ["4", "They pay by card — money goes straight to your Stripe account"],
              ].map(([n, t]) => (
                <div key={n} style={s.tip}>
                  <span style={s.tipNum}>{n}</span>
                  <span style={s.tipText}>{t}</span>
                </div>
              ))}
            </div>
            <div style={s.note}>
              💡 Tip: if you negotiated in person, just type in the agreed price and hit Generate — no invoicing software needed.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const BLUE = "#2563eb";

const s = {
  page: { padding: "2rem 2.5rem", maxWidth: 900, margin: "0 auto" },
  header: { marginBottom: "2rem" },
  title: { fontSize: "1.6rem", fontWeight: 800, margin: "0 0 0.4rem", letterSpacing: "-0.5px" },
  sub: { color: "#64748b", margin: 0, fontSize: "0.95rem" },
  layout: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" },

  card: { background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 16, padding: "2rem", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" },
  cardTitle: { fontWeight: 700, fontSize: "1rem", margin: "0 0 1.5rem", color: "#0f172a" },
  form: { display: "flex", flexDirection: "column", gap: "1.25rem" },
  label: { display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "0.875rem", fontWeight: 600, color: "#374151" },
  optional: { fontWeight: 400, color: "#94a3b8", fontSize: "0.8rem" },
  required: { color: "#ef4444" },
  input: { border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "0.65rem 0.85rem", fontSize: "0.95rem", outline: "none", fontFamily: "inherit", color: "#0f172a", width: "100%", boxSizing: "border-box" },
  amountRow: { position: "relative" },
  dollar: { position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontWeight: 600, fontSize: "0.95rem", zIndex: 1 },
  error: { background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "0.75rem 1rem", color: "#dc2626", fontSize: "0.875rem" },
  btn: { background: BLUE, color: "#fff", border: "none", borderRadius: 10, padding: "0.85rem", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer", marginTop: "0.25rem" },

  resultCard: { background: "#fff", border: "1.5px solid #d1fae5", borderRadius: 16, padding: "2rem", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" },
  resultIcon: { width: 52, height: 52, borderRadius: "50%", background: "#d1fae5", color: "#059669", fontSize: "1.5rem", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1rem", fontWeight: 700 },
  resultTitle: { fontWeight: 800, fontSize: "1.1rem", margin: "0 0 0.4rem" },
  resultSub: { color: "#64748b", fontSize: "0.85rem", margin: "0 0 1.5rem", lineHeight: 1.5 },
  linkBox: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.75rem 1rem", width: "100%", boxSizing: "border-box", marginBottom: "1rem" },
  linkText: { fontSize: "0.75rem", color: "#64748b", wordBreak: "break-all", fontFamily: "monospace" },
  resultActions: { display: "flex", gap: "0.75rem", marginBottom: "1.5rem", width: "100%" },
  copyBtn: { flex: 1, background: BLUE, color: "#fff", border: "none", borderRadius: 8, padding: "0.7rem", fontWeight: 700, fontSize: "0.875rem", cursor: "pointer" },
  openBtn: { flex: 1, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "0.7rem", fontWeight: 600, fontSize: "0.875rem", textDecoration: "none", color: "#374151", display: "flex", alignItems: "center", justifyContent: "center" },
  amount: { fontSize: "1.75rem", fontWeight: 800, color: "#0f172a", marginBottom: "1.5rem" },
  forName: { color: "#64748b", fontSize: "1rem", fontWeight: 500 },
  newBtn: { background: "transparent", border: "none", color: "#64748b", fontSize: "0.85rem", cursor: "pointer", textDecoration: "underline" },

  tipCard: { background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 16, padding: "2rem" },
  tipTitle: { fontWeight: 700, fontSize: "1rem", margin: "0 0 1.25rem", color: "#0f172a" },
  tips: { display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" },
  tip: { display: "flex", alignItems: "flex-start", gap: "0.75rem" },
  tipNum: { width: 26, height: 26, borderRadius: "50%", background: BLUE, color: "#fff", fontWeight: 700, fontSize: "0.8rem", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  tipText: { fontSize: "0.9rem", color: "#374151", lineHeight: 1.5, paddingTop: 3 },
  note: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.85rem 1rem", fontSize: "0.85rem", color: "#64748b", lineHeight: 1.55 },
};
