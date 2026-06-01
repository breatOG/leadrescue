import { useNavigate } from "react-router-dom";
import { getToken } from "../api/client.js";

const plans = [
  {
    name: "Starter",
    price: 79,
    tagline: "Perfect for solo contractors getting started.",
    features: [
      "AI SMS responses",
      "Up to 100 leads / month",
      "Lead dashboard",
      "Email support",
    ],
    cta: "Get Started",
    highlight: false,
  },
  {
    name: "Pro",
    price: 199,
    tagline: "For growing businesses that need voice + SMS.",
    features: [
      "AI SMS + Voice calls",
      "Up to 500 leads / month",
      "Full dashboard & analytics",
      "Appointment booking",
      "Priority support",
    ],
    cta: "Start Free Trial",
    highlight: true,
    badge: "Most Popular",
  },
  {
    name: "Scale",
    price: 399,
    tagline: "For multi-location operations at full scale.",
    features: [
      "Everything in Pro",
      "Unlimited leads",
      "Multiple locations",
      "API access",
      "Dedicated account manager",
    ],
    cta: "Contact Sales",
    highlight: false,
  },
];

export default function Pricing() {
  const navigate = useNavigate();

  function handleCta(plan) {
    if (plan.name === "Scale") {
      window.location.href = "mailto:hello@leadrescue.com?subject=Scale Plan Inquiry";
    } else {
      navigate(getToken() ? "/dashboard" : "/login");
    }
  }

  return (
    <div style={s.page}>
      {/* Nav */}
      <nav style={s.nav}>
        <span style={s.logo}>LeadRescue</span>
        <button style={s.loginBtn} onClick={() => navigate(getToken() ? "/dashboard" : "/login")}>
          {getToken() ? "Go to Dashboard" : "Log In"}
        </button>
      </nav>

      {/* Hero */}
      <section style={s.hero}>
        <div style={s.heroInner}>
          <span style={s.pill}>AI-Powered Lead Response</span>
          <h1 style={s.headline}>
            Never Miss a Lead<br />
            <span style={s.accent}>While You're on the Job</span>
          </h1>
          <p style={s.sub}>
            LeadRescue answers your missed calls and texts instantly with a human-sounding AI —
            qualifies leads, collects job details, and books appointments. 24/7.
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section style={s.section}>
        <h2 style={s.sectionTitle}>Simple, Transparent Pricing</h2>
        <p style={s.sectionSub}>No setup fees. Cancel anytime.</p>
        <div style={s.cards}>
          {plans.map((plan) => (
            <div key={plan.name} style={{ ...s.card, ...(plan.highlight ? s.cardHighlight : {}) }}>
              {plan.badge && <div style={s.badge}>{plan.badge}</div>}
              <div style={s.planName}>{plan.name}</div>
              <div style={s.price}>
                <span style={s.dollar}>$</span>
                <span style={s.amount}>{plan.price}</span>
                <span style={s.period}>/mo</span>
              </div>
              <p style={{ ...s.tagline, ...(plan.highlight ? s.taglineLight : {}) }}>{plan.tagline}</p>
              <ul style={s.features}>
                {plan.features.map((f) => (
                  <li key={f} style={s.feature}>
                    <span style={{ ...s.check, ...(plan.highlight ? s.checkLight : {}) }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                style={{ ...s.cta, ...(plan.highlight ? s.ctaHighlight : {}) }}
                onClick={() => handleCta(plan)}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Features strip */}
      <section style={s.strip}>
        {[
          ["📞", "Answers missed calls instantly"],
          ["💬", "Replies to texts 24/7"],
          ["📅", "Books appointments automatically"],
          ["📋", "Qualifies every lead"],
        ].map(([icon, text]) => (
          <div key={text} style={s.stripItem}>
            <span style={s.stripIcon}>{icon}</span>
            <span style={s.stripText}>{text}</span>
          </div>
        ))}
      </section>

      <footer style={s.footer}>© {new Date().getFullYear()} LeadRescue. All rights reserved.</footer>
    </div>
  );
}

const ACCENT = "#2563eb";
const HIGHLIGHT_BG = "#1e3a8a";

const s = {
  page: { minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', system-ui, sans-serif", color: "#0f172a" },
  nav: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.25rem 2.5rem", background: "#fff", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 100 },
  logo: { fontWeight: 800, fontSize: "1.25rem", letterSpacing: "-0.5px", color: ACCENT },
  loginBtn: { background: "transparent", border: `1.5px solid ${ACCENT}`, color: ACCENT, borderRadius: 8, padding: "0.5rem 1.25rem", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" },
  hero: { background: `linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)`, color: "#fff", padding: "5rem 2.5rem 4rem", textAlign: "center" },
  heroInner: { maxWidth: 680, margin: "0 auto" },
  pill: { display: "inline-block", background: "rgba(255,255,255,0.15)", borderRadius: 999, padding: "0.35rem 1rem", fontSize: "0.8rem", fontWeight: 600, letterSpacing: 0.5, marginBottom: "1.5rem" },
  headline: { fontSize: "clamp(2rem, 5vw, 3.25rem)", fontWeight: 800, lineHeight: 1.15, margin: "0 0 1.25rem" },
  accent: { color: "#93c5fd" },
  sub: { fontSize: "1.1rem", lineHeight: 1.7, opacity: 0.88, margin: 0 },
  section: { maxWidth: 1100, margin: "0 auto", padding: "4rem 2rem" },
  sectionTitle: { textAlign: "center", fontSize: "2rem", fontWeight: 800, margin: "0 0 0.5rem" },
  sectionSub: { textAlign: "center", color: "#64748b", marginBottom: "3rem", fontSize: "1rem" },
  cards: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem", alignItems: "start" },
  card: { background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 16, padding: "2rem 1.75rem", position: "relative", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" },
  cardHighlight: { background: HIGHLIGHT_BG, border: `1.5px solid ${HIGHLIGHT_BG}`, color: "#fff", boxShadow: "0 8px 30px rgba(30,58,138,0.35)", transform: "scale(1.03)" },
  badge: { position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: "#f59e0b", color: "#fff", borderRadius: 999, padding: "0.25rem 1rem", fontSize: "0.75rem", fontWeight: 700, whiteSpace: "nowrap" },
  planName: { fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.75rem", opacity: 0.75 },
  price: { display: "flex", alignItems: "flex-end", gap: 2, marginBottom: "0.75rem" },
  dollar: { fontSize: "1.25rem", fontWeight: 700, marginBottom: 4 },
  amount: { fontSize: "3rem", fontWeight: 800, lineHeight: 1 },
  period: { fontSize: "1rem", opacity: 0.6, marginBottom: 6 },
  tagline: { fontSize: "0.9rem", color: "#64748b", marginBottom: "1.5rem", lineHeight: 1.5 },
  taglineLight: { color: "#93c5fd" },
  features: { listStyle: "none", padding: 0, margin: "0 0 2rem", display: "flex", flexDirection: "column", gap: "0.65rem" },
  feature: { display: "flex", alignItems: "flex-start", gap: "0.6rem", fontSize: "0.9rem", lineHeight: 1.4 },
  check: { color: ACCENT, fontWeight: 700, flexShrink: 0 },
  checkLight: { color: "#6ee7b7" },
  cta: { width: "100%", padding: "0.85rem", borderRadius: 10, border: `2px solid ${ACCENT}`, background: "transparent", color: ACCENT, fontWeight: 700, fontSize: "1rem", cursor: "pointer" },
  ctaHighlight: { background: "#fff", color: HIGHLIGHT_BG, border: "2px solid #fff" },
  strip: { background: "#1e293b", color: "#fff", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "2rem", padding: "2.5rem 2rem" },
  stripItem: { display: "flex", alignItems: "center", gap: "0.75rem" },
  stripIcon: { fontSize: "1.5rem" },
  stripText: { fontSize: "0.95rem", fontWeight: 500 },
  footer: { textAlign: "center", padding: "2rem", color: "#94a3b8", fontSize: "0.85rem", background: "#f8fafc" },
};
