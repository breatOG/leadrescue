import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, getToken, setToken, setUser } from "../api/client.js";

const plans = [
  {
    key: "starter",
    name: "Starter",
    price: 79,
    features: ["AI SMS responses", "Up to 100 leads / month", "Lead dashboard", "Email support"],
  },
  {
    key: "pro",
    name: "Pro",
    price: 199,
    badge: "Most Popular",
    features: ["AI SMS + Voice calls", "Up to 500 leads / month", "Full dashboard & analytics", "Appointment booking", "Priority support"],
  },
  {
    key: "scale",
    name: "Scale",
    price: 399,
    features: ["Everything in Pro", "Unlimited leads", "Multiple locations", "API access", "Dedicated account manager"],
  },
];

export default function Subscribe() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [selected, setSelected] = useState(params.get("plan") || "pro");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!getToken()) {
    navigate("/register");
    return null;
  }

  async function checkout() {
    setError("");
    setLoading(true);
    try {
      const data = await api("/api/payments/subscribe", { method: "POST", body: { plan: selected } });
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.logo}>
          <img src="/logo.svg" alt="LeadRescue" style={s.logoMark} />
          <span style={s.logoText}>LeadRescue</span>
        </div>
      </div>

      <div style={s.content}>
        <div style={s.textCenter}>
          <h1 style={s.title}>Choose your plan</h1>
          <p style={s.sub}>You can upgrade or cancel anytime. Billed monthly.</p>
        </div>

        <div style={s.plans}>
          {plans.map((plan) => (
            <button
              key={plan.key}
              style={selected === plan.key ? s.planCardSelected : s.planCard}
              onClick={() => setSelected(plan.key)}
            >
              {plan.badge && <div style={s.badge}>{plan.badge}</div>}
              <div style={s.planTop}>
                <div style={s.planName}>{plan.name}</div>
                <div style={s.planPrice}>
                  <span style={s.dollar}>$</span>
                  <span style={s.amount}>{plan.price}</span>
                  <span style={s.period}>/mo</span>
                </div>
              </div>
              <ul style={s.features}>
                {plan.features.map((f) => (
                  <li key={f} style={s.feature}>
                    <span style={selected === plan.key ? s.checkSelected : s.check}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              {selected === plan.key && <div style={s.selectedIndicator}>Selected ✓</div>}
            </button>
          ))}
        </div>

        {error && <div style={s.error}>{error}</div>}

        <button style={s.ctaBtn} onClick={checkout} disabled={loading}>
          {loading ? "Redirecting to Stripe…" : `Continue with ${plans.find(p => p.key === selected)?.name} — $${plans.find(p => p.key === selected)?.price}/mo →`}
        </button>
        <p style={s.secure}>🔒 Secure payment via Stripe. Cancel anytime.</p>
      </div>
    </div>
  );
}

const BLUE = "#2563eb";
const DARK = "#0f172a";

const s = {
  page: { minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', system-ui, sans-serif" },
  header: { padding: "1.25rem 2.5rem", background: "#fff", borderBottom: "1px solid #f1f5f9" },
  logo: { display: "flex", alignItems: "center", gap: "0.5rem" },
  logoMark: { width: 32, height: 32, borderRadius: 8, objectFit: "cover", display: "block" },
  logoText: { fontWeight: 800, fontSize: "1.1rem", color: DARK },
  content: { maxWidth: 960, margin: "0 auto", padding: "4rem 2rem" },
  textCenter: { textAlign: "center", marginBottom: "3rem" },
  title: { fontSize: "2rem", fontWeight: 800, margin: "0 0 0.5rem", letterSpacing: "-0.75px", color: DARK },
  sub: { color: "#64748b", fontSize: "1rem", margin: 0 },
  plans: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.25rem", marginBottom: "2rem" },
  planCard: { background: "#fff", border: "2px solid #e2e8f0", borderRadius: 16, padding: "1.75rem", textAlign: "left", cursor: "pointer", position: "relative", transition: "border-color 0.15s" },
  planCardSelected: { background: "#fff", border: `2px solid ${BLUE}`, borderRadius: 16, padding: "1.75rem", textAlign: "left", cursor: "pointer", position: "relative", boxShadow: `0 0 0 4px rgba(37,99,235,0.1)` },
  badge: { position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "#f59e0b", color: "#fff", borderRadius: 999, padding: "0.2rem 0.85rem", fontSize: "0.72rem", fontWeight: 700, whiteSpace: "nowrap" },
  planTop: { marginBottom: "1.25rem" },
  planName: { fontWeight: 700, fontSize: "0.8rem", color: "#94a3b8", letterSpacing: 1, textTransform: "uppercase", marginBottom: "0.5rem" },
  planPrice: { display: "flex", alignItems: "flex-end", gap: 2 },
  dollar: { fontWeight: 700, color: DARK, fontSize: "1.1rem", marginBottom: 4 },
  amount: { fontSize: "2.75rem", fontWeight: 800, color: DARK, lineHeight: 1, letterSpacing: "-2px" },
  period: { color: "#94a3b8", marginBottom: 6 },
  features: { listStyle: "none", padding: 0, margin: "0 0 1rem", display: "flex", flexDirection: "column", gap: "0.6rem" },
  feature: { display: "flex", alignItems: "flex-start", gap: "0.6rem", fontSize: "0.875rem", color: "#374151", lineHeight: 1.4 },
  check: { color: "#94a3b8", fontWeight: 700, flexShrink: 0 },
  checkSelected: { color: BLUE, fontWeight: 700, flexShrink: 0 },
  selectedIndicator: { color: BLUE, fontWeight: 700, fontSize: "0.85rem", marginTop: "0.5rem" },
  error: { background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "0.75rem 1rem", color: "#dc2626", fontSize: "0.875rem", marginBottom: "1rem" },
  ctaBtn: { width: "100%", background: BLUE, color: "#fff", border: "none", borderRadius: 12, padding: "1.1rem", fontWeight: 700, fontSize: "1.05rem", cursor: "pointer", boxShadow: "0 4px 20px rgba(37,99,235,0.35)", display: "block" },
  secure: { textAlign: "center", color: "#94a3b8", fontSize: "0.8rem", margin: "1rem 0 0" },
};
