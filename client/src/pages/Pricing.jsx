import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getToken, getUser } from "../api/client.js";

const plans = [
  {
    name: "Starter",
    price: 79,
    tagline: "For solo contractors ready to stop missing leads.",
    features: ["AI SMS responses", "Up to 100 leads / month", "Lead dashboard", "Email support"],
    cta: "Get Started",
    highlight: false,
  },
  {
    name: "Pro",
    price: 199,
    tagline: "For growing businesses that need voice + SMS.",
    features: ["AI SMS + Voice calls", "Up to 500 leads / month", "Full dashboard & analytics", "Appointment booking", "Priority support"],
    cta: "Start Free Trial",
    highlight: true,
    badge: "Most Popular",
  },
  {
    name: "Scale",
    price: 399,
    tagline: "For multi-location operations at full scale.",
    features: ["Everything in Pro", "Unlimited leads", "Multiple locations", "API access", "Dedicated account manager"],
    cta: "Contact Sales",
    highlight: false,
  },
];

const stats = [
  { value: "2 min", label: "Average response time" },
  { value: "94%", label: "Lead qualification rate" },
  { value: "3x", label: "More booked jobs" },
  { value: "24/7", label: "Always on, never misses" },
];

const features = [
  { icon: "📞", title: "AI Voice Calls", desc: "Answers missed calls instantly with a human-sounding voice. Qualifies the lead, collects details, books the job." },
  { icon: "💬", title: "SMS Follow-Up", desc: "Automatically texts every missed call and inbound lead within seconds — before they call a competitor." },
  { icon: "📅", title: "Smart Scheduling", desc: "Offers appointment slots, confirms times, and syncs everything to your dashboard automatically." },
  { icon: "📋", title: "Lead Intelligence", desc: "Every call and text gets summarized with job type, urgency, address, and contact info — ready for you to act on." },
];

export default function Pricing() {
  const navigate = useNavigate();

  useEffect(() => {
    const user = getUser();
    if (getToken() && user?.subscriptionStatus === "active") {
      navigate("/dashboard", { replace: true });
    }
  }, []);

  function handleCta(plan) {
    if (plan.name === "Scale") {
      window.location.href = "mailto:hello@leadrescue.com?subject=Scale Plan Inquiry";
    } else if (getToken()) {
      // Already logged in but no active sub — go straight to checkout
      navigate(`/subscribe?plan=${plan.name.toLowerCase()}`);
    } else {
      navigate(`/register?plan=${plan.name.toLowerCase()}`);
    }
  }

  return (
    <div style={s.page}>
      {/* Nav */}
      <nav style={s.nav}>
        <div style={s.navInner}>
          <div style={s.logo}>
            <div style={s.logoMark}>LR</div>
            <span style={s.logoText}>LeadRescue</span>
          </div>
          <div style={s.navLinks}>
            <a href="#features" style={s.navLink}>Features</a>
            <a href="#pricing" style={s.navLink}>Pricing</a>
            <button style={s.loginBtn} onClick={() => navigate("/login")}>Log In</button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={s.hero}>
        <div style={s.heroBg} />
        <div style={s.heroContent}>
          <div style={s.heroEyebrow}>
            <span style={s.dot} /> AI-Powered Lead Response for Contractors
          </div>
          <h1 style={s.heroHeadline}>
            Your jobs are on-site.<br />
            <span style={s.heroAccent}>Your leads are covered.</span>
          </h1>
          <p style={s.heroSub}>
            LeadRescue answers missed calls and texts instantly — qualifying leads, booking appointments,
            and sending you a clean summary. All while you're working.
          </p>
          <div style={s.heroCtas}>
            <button style={s.heroPrimary} onClick={() => navigate("/login")}>
              Start Free Trial →
            </button>
            <a href="#features" style={s.heroSecondary}>See how it works</a>
          </div>
        </div>
        {/* Stats bar */}
        <div style={s.statsBar}>
          {stats.map(({ value, label }) => (
            <div key={label} style={s.statItem}>
              <div style={s.statValue}>{value}</div>
              <div style={s.statLabel}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" style={s.featuresSection}>
        <div style={s.container}>
          <div style={s.sectionTag}>How It Works</div>
          <h2 style={s.sectionTitle}>Built for contractors who can't afford to miss a call</h2>
          <p style={s.sectionSub}>Every missed call is a missed job. LeadRescue makes sure that never happens.</p>
          <div style={s.featureGrid}>
            {features.map(({ icon, title, desc }) => (
              <div key={title} style={s.featureCard}>
                <div style={s.featureIcon}>{icon}</div>
                <h3 style={s.featureTitle}>{title}</h3>
                <p style={s.featureDesc}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={s.pricingSection}>
        <div style={s.container}>
          <div style={s.sectionTag}>Pricing</div>
          <h2 style={s.sectionTitle}>Simple pricing, serious results</h2>
          <p style={s.sectionSub}>No setup fees. No contracts. Cancel anytime.</p>
          <div style={s.pricingGrid}>
            {plans.map((plan) => (
              <div key={plan.name} style={plan.highlight ? s.cardPro : s.card}>
                {plan.badge && <div style={s.badge}>{plan.badge}</div>}
                <div style={s.cardHeader}>
                  <div style={plan.highlight ? s.planNamePro : s.planName}>{plan.name}</div>
                  <div style={s.priceRow}>
                    <span style={plan.highlight ? s.currencyPro : s.currency}>$</span>
                    <span style={plan.highlight ? s.amountPro : s.amount}>{plan.price}</span>
                    <span style={plan.highlight ? s.periodPro : s.period}>/mo</span>
                  </div>
                  <p style={plan.highlight ? s.taglinePro : s.tagline}>{plan.tagline}</p>
                </div>
                <div style={plan.highlight ? s.dividerPro : s.divider} />
                <ul style={s.featureList}>
                  {plan.features.map((f) => (
                    <li key={f} style={s.featureItem}>
                      <span style={plan.highlight ? s.checkPro : s.check}>✓</span>
                      <span style={plan.highlight ? s.featureTextPro : s.featureText}>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  style={plan.highlight ? s.ctaPro : s.cta}
                  onClick={() => handleCta(plan)}
                >
                  {plan.cta}
                </button>
                {plan.highlight && (
                  <p style={s.trialNote}>14-day free trial • No credit card required</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section style={s.bottomCta}>
        <div style={s.container}>
          <h2 style={s.bottomTitle}>Ready to stop losing leads?</h2>
          <p style={s.bottomSub}>Join contractors using LeadRescue to capture every opportunity.</p>
          <button style={s.bottomBtn} onClick={() => navigate("/login")}>
            Get Started Free →
          </button>
        </div>
      </section>

      <footer style={s.footer}>
        <div style={s.footerInner}>
          <div style={s.footerLogo}>
            <div style={{ ...s.logoMark, width: 28, height: 28, fontSize: "0.75rem" }}>LR</div>
            <span style={{ fontWeight: 700, color: "#fff" }}>LeadRescue</span>
          </div>
          <p style={s.footerText}>© {new Date().getFullYear()} LeadRescue. All rights reserved.</p>
          <div style={s.footerLinks}>
            <a href="/legal/privacy" style={s.footerLink}>Privacy</a>
            <a href="/legal/terms" style={s.footerLink}>Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

const BLUE = "#2563eb";
const DARK_BLUE = "#1e40af";
const PRO_BG = "#0f172a";

const s = {
  page: { minHeight: "100vh", background: "#ffffff", fontFamily: "'Inter', system-ui, -apple-system, sans-serif", color: "#0f172a", margin: 0 },

  // Nav
  nav: { position: "sticky", top: 0, zIndex: 100, background: "rgba(255,255,255,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid #f1f5f9" },
  navInner: { maxWidth: 1160, margin: "0 auto", padding: "0 2rem", height: 68, display: "flex", alignItems: "center", justifyContent: "space-between" },
  logo: { display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" },
  logoMark: { width: 34, height: 34, borderRadius: 9, background: `linear-gradient(135deg, ${BLUE}, ${DARK_BLUE})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: "0.85rem" },
  logoText: { fontWeight: 800, fontSize: "1.15rem", color: "#0f172a", letterSpacing: "-0.3px" },
  navLinks: { display: "flex", alignItems: "center", gap: "2rem" },
  navLink: { color: "#64748b", textDecoration: "none", fontWeight: 500, fontSize: "0.9rem" },
  loginBtn: { background: "#fff", border: `1.5px solid #e2e8f0`, color: "#0f172a", borderRadius: 8, padding: "0.5rem 1.25rem", cursor: "pointer", fontWeight: 600, fontSize: "0.875rem", transition: "all 0.15s" },

  // Hero
  hero: { position: "relative", background: PRO_BG, overflow: "hidden", paddingBottom: 0 },
  heroBg: { position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% -10%, #1d4ed8 0%, transparent 70%)", opacity: 0.6 },
  heroContent: { position: "relative", maxWidth: 760, margin: "0 auto", padding: "6rem 2rem 4rem", textAlign: "center" },
  heroEyebrow: { display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 999, padding: "0.4rem 1.1rem", fontSize: "0.8rem", color: "#94a3b8", fontWeight: 500, marginBottom: "2rem" },
  dot: { width: 6, height: 6, borderRadius: "50%", background: "#4ade80", display: "inline-block" },
  heroHeadline: { fontSize: "clamp(2.25rem, 5vw, 3.75rem)", fontWeight: 800, lineHeight: 1.1, color: "#fff", margin: "0 0 1.5rem", letterSpacing: "-1.5px" },
  heroAccent: { background: "linear-gradient(90deg, #60a5fa, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  heroSub: { fontSize: "1.15rem", lineHeight: 1.75, color: "#94a3b8", margin: "0 0 2.5rem", maxWidth: 580, marginLeft: "auto", marginRight: "auto" },
  heroCtas: { display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" },
  heroPrimary: { background: BLUE, color: "#fff", border: "none", borderRadius: 10, padding: "0.9rem 2rem", fontWeight: 700, fontSize: "1rem", cursor: "pointer", boxShadow: "0 4px 20px rgba(37,99,235,0.4)" },
  heroSecondary: { color: "#94a3b8", textDecoration: "none", fontWeight: 500, fontSize: "0.95rem", display: "flex", alignItems: "center", padding: "0.9rem 1rem" },

  // Stats bar
  statsBar: { position: "relative", maxWidth: 1160, margin: "4rem auto 0", padding: "0 2rem", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderTop: "1px solid rgba(255,255,255,0.08)" },
  statItem: { padding: "2rem 1rem", textAlign: "center", borderRight: "1px solid rgba(255,255,255,0.08)" },
  statValue: { fontSize: "2rem", fontWeight: 800, color: "#fff", letterSpacing: "-1px", marginBottom: "0.35rem" },
  statLabel: { fontSize: "0.8rem", color: "#64748b", fontWeight: 500 },

  // Features
  featuresSection: { padding: "6rem 0", background: "#f8fafc" },
  container: { maxWidth: 1160, margin: "0 auto", padding: "0 2rem" },
  sectionTag: { display: "inline-block", color: BLUE, fontWeight: 700, fontSize: "0.8rem", letterSpacing: 1, textTransform: "uppercase", marginBottom: "1rem" },
  sectionTitle: { fontSize: "clamp(1.75rem, 3vw, 2.5rem)", fontWeight: 800, margin: "0 0 1rem", letterSpacing: "-0.75px", maxWidth: 600 },
  sectionSub: { color: "#64748b", fontSize: "1.05rem", marginBottom: "3.5rem", maxWidth: 520, lineHeight: 1.65 },
  featureGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.5rem" },
  featureCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "2rem", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" },
  featureIcon: { fontSize: "1.75rem", marginBottom: "1rem" },
  featureTitle: { fontWeight: 700, fontSize: "1rem", margin: "0 0 0.5rem", color: "#0f172a" },
  featureDesc: { color: "#64748b", fontSize: "0.9rem", lineHeight: 1.65, margin: 0 },

  // Pricing
  pricingSection: { padding: "6rem 0", background: "#fff" },
  pricingGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem", alignItems: "center" },

  card: { background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 20, padding: "2.25rem", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", position: "relative" },
  cardPro: { background: PRO_BG, border: `1.5px solid #1e3a8a`, borderRadius: 20, padding: "2.25rem", boxShadow: "0 20px 60px rgba(15,23,42,0.3)", position: "relative", transform: "scale(1.04)" },

  badge: { position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: "#f59e0b", color: "#fff", borderRadius: 999, padding: "0.3rem 1rem", fontSize: "0.72rem", fontWeight: 700, letterSpacing: 0.5, whiteSpace: "nowrap" },

  cardHeader: { marginBottom: "1.5rem" },
  planName: { fontWeight: 700, fontSize: "0.85rem", color: "#94a3b8", letterSpacing: 1, textTransform: "uppercase", marginBottom: "1rem" },
  planNamePro: { fontWeight: 700, fontSize: "0.85rem", color: "#60a5fa", letterSpacing: 1, textTransform: "uppercase", marginBottom: "1rem" },
  priceRow: { display: "flex", alignItems: "flex-end", gap: 2, marginBottom: "0.75rem" },
  currency: { fontSize: "1.25rem", fontWeight: 700, color: "#374151", marginBottom: 6 },
  currencyPro: { fontSize: "1.25rem", fontWeight: 700, color: "#fff", marginBottom: 6 },
  amount: { fontSize: "3.25rem", fontWeight: 800, lineHeight: 1, color: "#0f172a", letterSpacing: "-2px" },
  amountPro: { fontSize: "3.25rem", fontWeight: 800, lineHeight: 1, color: "#fff", letterSpacing: "-2px" },
  period: { fontSize: "1rem", color: "#94a3b8", marginBottom: 8 },
  periodPro: { fontSize: "1rem", color: "#64748b", marginBottom: 8 },
  tagline: { fontSize: "0.875rem", color: "#64748b", lineHeight: 1.55, margin: 0 },
  taglinePro: { fontSize: "0.875rem", color: "#94a3b8", lineHeight: 1.55, margin: 0 },

  divider: { height: 1, background: "#f1f5f9", margin: "1.5rem 0" },
  dividerPro: { height: 1, background: "rgba(255,255,255,0.08)", margin: "1.5rem 0" },

  featureList: { listStyle: "none", padding: 0, margin: "0 0 2rem", display: "flex", flexDirection: "column", gap: "0.75rem" },
  featureItem: { display: "flex", alignItems: "flex-start", gap: "0.75rem" },
  check: { color: BLUE, fontWeight: 800, flexShrink: 0, fontSize: "0.9rem", marginTop: 1 },
  checkPro: { color: "#4ade80", fontWeight: 800, flexShrink: 0, fontSize: "0.9rem", marginTop: 1 },
  featureText: { fontSize: "0.9rem", color: "#374151", lineHeight: 1.4 },
  featureTextPro: { fontSize: "0.9rem", color: "#e2e8f0", lineHeight: 1.4 },

  cta: { width: "100%", padding: "0.9rem", borderRadius: 10, border: `2px solid #e2e8f0`, background: "#fff", color: "#0f172a", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer" },
  ctaPro: { width: "100%", padding: "0.9rem", borderRadius: 10, border: "none", background: BLUE, color: "#fff", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer", boxShadow: "0 4px 16px rgba(37,99,235,0.4)" },
  trialNote: { textAlign: "center", fontSize: "0.78rem", color: "#475569", margin: "1rem 0 0" },

  // Bottom CTA
  bottomCta: { background: `linear-gradient(135deg, ${BLUE} 0%, ${DARK_BLUE} 100%)`, padding: "5rem 2rem", textAlign: "center" },
  bottomTitle: { fontSize: "clamp(1.75rem, 3vw, 2.5rem)", fontWeight: 800, color: "#fff", margin: "0 0 1rem", letterSpacing: "-0.75px" },
  bottomSub: { color: "rgba(255,255,255,0.75)", fontSize: "1.05rem", margin: "0 0 2.5rem" },
  bottomBtn: { background: "#fff", color: BLUE, border: "none", borderRadius: 10, padding: "1rem 2.5rem", fontWeight: 700, fontSize: "1rem", cursor: "pointer", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" },

  // Footer
  footer: { background: "#0f172a", padding: "2.5rem 2rem" },
  footerInner: { maxWidth: 1160, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" },
  footerLogo: { display: "flex", alignItems: "center", gap: "0.5rem" },
  footerText: { color: "#475569", fontSize: "0.85rem", margin: 0 },
  footerLinks: { display: "flex", gap: "1.5rem" },
  footerLink: { color: "#475569", textDecoration: "none", fontSize: "0.85rem" },
};
