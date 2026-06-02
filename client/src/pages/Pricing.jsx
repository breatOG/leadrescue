import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getToken, getUser } from "../api/client.js";

// ── Conversation demo data ────────────────────────────────────────────────────
const DEMO = [
  { dir: "in",  text: "Missed call from +1 (317) 555-0142", type: "event" },
  { dir: "out", text: "Hey! Thanks for calling Smith Plumbing. I'm Jamie — what can I help you with today?" },
  { dir: "in",  text: "Yeah hi, I've got a burst pipe under my kitchen sink, water everywhere" },
  { dir: "out", text: "Oh no — a burst pipe, that's a mess. Is it actively leaking right now or did you get it stopped?" },
  { dir: "in",  text: "Still leaking, I turned the valve off but it's dripping pretty bad" },
  { dir: "out", text: "Got it. What's the address for the job?" },
  { dir: "in",  text: "4821 Maple Ave, Indianapolis" },
  { dir: "out", text: "Perfect. We have a slot open tomorrow at 9 AM — does that work?" },
  { dir: "in",  text: "Yes that's great" },
  { dir: "out", text: "You're booked! Someone from the team will see you tomorrow at 9 AM. 🎉" },
];

function AnimatedChat() {
  const [visible, setVisible] = useState([]);
  const [typing, setTyping] = useState(false);
  const ref = useRef(null);
  const idx = useRef(0);

  useEffect(() => {
    function next() {
      if (idx.current >= DEMO.length) {
        setTimeout(() => { idx.current = 0; setVisible([]); setTimeout(next, 800); }, 3000);
        return;
      }
      const msg = DEMO[idx.current];
      if (msg.dir === "out") {
        setTyping(true);
        setTimeout(() => {
          setTyping(false);
          setVisible((v) => [...v, msg]);
          idx.current++;
          setTimeout(next, msg.text.length * 18 + 600);
        }, 1100);
      } else {
        setVisible((v) => [...v, msg]);
        idx.current++;
        setTimeout(next, msg.text.length * 14 + 400);
      }
    }
    const t = setTimeout(next, 600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [visible, typing]);

  return (
    <div style={{
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 20, overflow: "hidden", backdropFilter: "blur(20px)",
      boxShadow: "0 40px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(16,185,129,0.2)",
      width: "100%", maxWidth: 400
    }}>
      <div style={{ background: "rgba(16,185,129,0.15)", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,#10b981,#059669)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.9rem", color: "#fff" }}>LR</div>
        <div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: "0.9rem" }}>LeadRescue AI</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", animation: "pulse-dot 2s infinite" }} />
            <span style={{ color: "#6ee7b7", fontSize: "0.72rem" }}>Active 24/7</span>
          </div>
        </div>
      </div>
      <div ref={ref} style={{ padding: "16px 14px", minHeight: 320, maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, scrollBehavior: "smooth" }}>
        {visible.map((m, i) => (
          m.type === "event"
            ? <div key={i} style={{ textAlign: "center", fontSize: "0.72rem", color: "#6ee7b7", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 99, padding: "4px 12px", alignSelf: "center" }}>{m.text}</div>
            : <div key={i} style={{ maxWidth: "82%", alignSelf: m.dir === "out" ? "flex-start" : "flex-end", animation: "bubble-in 0.25s ease" }}>
                <div style={{ background: m.dir === "out" ? "rgba(16,185,129,0.18)" : "rgba(255,255,255,0.1)", border: `1px solid ${m.dir === "out" ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.08)"}`, borderRadius: m.dir === "out" ? "4px 16px 16px 16px" : "16px 4px 16px 16px", padding: "10px 14px", color: "#f0fdfa", fontSize: "0.84rem", lineHeight: 1.5 }}>
                  {m.text}
                </div>
              </div>
        ))}
        {typing && (
          <div style={{ alignSelf: "flex-start", background: "rgba(16,185,129,0.18)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: "4px 16px 16px 16px", padding: "12px 16px", display: "flex", gap: 5 }}>
            {[0, 1, 2].map((i) => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", animation: `bounce-dot 1.2s ${i * 0.2}s infinite` }} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Scroll reveal hook ────────────────────────────────────────────────────────
function useReveal() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.15 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, visible];
}

// ── Animated counter ──────────────────────────────────────────────────────────
function Counter({ target, suffix = "", prefix = "" }) {
  const [n, setN] = useState(0);
  const [ref, visible] = useReveal();
  useEffect(() => {
    if (!visible) return;
    const num = parseFloat(target);
    const dur = 1800;
    const start = performance.now();
    const raf = (t) => {
      const p = Math.min((t - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(eased * num * 10) / 10);
      if (p < 1) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }, [visible, target]);
  return <span ref={ref}>{prefix}{n}{suffix}</span>;
}

const plans = [
  { name: "Starter", price: 79, tagline: "For solo contractors ready to stop missing leads.", features: ["AI SMS responses", "Up to 100 leads / month", "Lead dashboard", "Email support"], cta: "Get Started", highlight: false },
  { name: "Pro", price: 199, tagline: "For growing businesses that need voice + SMS.", features: ["AI SMS + Voice calls", "Up to 500 leads / month", "Full dashboard & analytics", "Appointment booking", "Priority support"], cta: "Start Free Trial", highlight: true, badge: "Most Popular" },
  { name: "Scale", price: 399, tagline: "For multi-location operations at full scale.", features: ["Everything in Pro", "Unlimited leads", "Multiple locations", "API access", "Dedicated account manager"], cta: "Contact Sales", highlight: false },
];

const features = [
  { icon: "📞", title: "AI Voice Calls", desc: "Answers every missed call instantly with a natural voice. Qualifies the lead, collects job details, books the appointment — all without you lifting a finger." },
  { icon: "💬", title: "Instant SMS", desc: "Texts every inbound lead within seconds. Before they even hang up, your AI is already following up and collecting their info." },
  { icon: "📅", title: "Smart Scheduling", desc: "Offers real appointment slots, confirms times, and logs everything to your calendar and dashboard automatically." },
  { icon: "📋", title: "Lead Intelligence", desc: "Every conversation gets summarized: job type, urgency, address, and contact — everything you need to close the job." },
];

const testimonials = [
  { quote: "I was losing 8–10 calls a week. LeadRescue pays for itself every single day. My close rate is up 40%.", name: "Marcus T.", role: "Owner, Phoenix HVAC" },
  { quote: "The AI sounds so natural — customers don't even know it's not a person. Three more booked jobs in the first week.", name: "Sarah K.", role: "Owner, K&K Plumbing" },
  { quote: "Finally, a system that actually works for contractors. Set it up in an afternoon. Works every night and weekend.", name: "Dave R.", role: "Owner, Ridge Roofing Co." },
];

export default function Landing() {
  const navigate = useNavigate();
  const [heroVisible, setHeroVisible] = useState(false);
  const [featRef, featVisible] = useReveal();
  const [statsRef, statsVisible] = useReveal();
  const [pricingRef, pricingVisible] = useReveal();
  const [testimonialsRef, testimonialsVisible] = useReveal();

  useEffect(() => {
    const user = getUser();
    if (getToken() && user?.subscriptionStatus === "active") navigate("/dashboard", { replace: true });
    const t = setTimeout(() => setHeroVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  function handleCta(plan) {
    if (plan.name === "Scale") { window.location.href = "mailto:hello@leadrescue.com?subject=Scale Plan Inquiry"; return; }
    navigate(getToken() ? `/subscribe?plan=${plan.name.toLowerCase()}` : `/register?plan=${plan.name.toLowerCase()}`);
  }

  return (
    <div style={{ background: "#050d1a", color: "#f0fdfa", fontFamily: "Inter, system-ui, sans-serif", overflowX: "hidden" }}>

      {/* ── NAV ─────────────────────────────────────────────────────────────── */}
      <nav style={{ position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(20px)", background: "rgba(5,13,26,0.85)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 24px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg,#10b981,#059669)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: "0.82rem", color: "#fff", boxShadow: "0 4px 12px rgba(16,185,129,0.4)" }}>LR</div>
            <span style={{ fontWeight: 850, fontSize: "1.05rem", color: "#fff" }}>LeadRescue</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link to="/login" style={{ color: "#94a3b8", fontWeight: 600, fontSize: "0.9rem", padding: "8px 16px", borderRadius: 8, textDecoration: "none", transition: "color 0.15s" }} onMouseEnter={e => e.target.style.color = "#fff"} onMouseLeave={e => e.target.style.color = "#94a3b8"}>Log in</Link>
            <Link to="/register" style={{ background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", fontWeight: 700, fontSize: "0.9rem", padding: "9px 20px", borderRadius: 9, textDecoration: "none", boxShadow: "0 4px 14px rgba(16,185,129,0.35)", transition: "transform 0.1s, box-shadow 0.15s" }} onMouseEnter={e => { e.target.style.transform = "translateY(-1px)"; e.target.style.boxShadow = "0 6px 20px rgba(16,185,129,0.5)"; }} onMouseLeave={e => { e.target.style.transform = ""; e.target.style.boxShadow = "0 4px 14px rgba(16,185,129,0.35)"; }}>Get started free</Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section style={{ position: "relative", minHeight: "92vh", display: "flex", alignItems: "center", overflow: "hidden" }}>
        {/* Background glows */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div style={{ position: "absolute", top: "-10%", left: "-5%", width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)", animation: "glow-pulse 6s ease-in-out infinite" }} />
          <div style={{ position: "absolute", bottom: "-15%", right: "-5%", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%)", animation: "glow-pulse 8s ease-in-out infinite reverse" }} />
          <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
        </div>

        <div className="lp-hero" style={{ maxWidth: 1120, margin: "0 auto", padding: "80px 24px", display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,0.9fr)", gap: 60, alignItems: "center", width: "100%", position: "relative" }}>
          <div style={{ opacity: heroVisible ? 1 : 0, transform: heroVisible ? "none" : "translateY(30px)", transition: "all 0.8s cubic-bezier(0.16,1,0.3,1)" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 99, padding: "6px 14px", fontSize: "0.78rem", fontWeight: 700, color: "#6ee7b7", marginBottom: 28, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", animation: "pulse-dot 2s infinite" }} />
              AI Lead Recovery · Always On
            </div>
            <h1 style={{ margin: "0 0 24px", fontSize: "clamp(2.8rem, 6vw, 5rem)", fontWeight: 950, lineHeight: 1.0, letterSpacing: "-0.03em" }}>
              Stop losing jobs<br />
              <span style={{ background: "linear-gradient(90deg, #10b981, #34d399, #6ee7b7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                to missed calls.
              </span>
            </h1>
            <p style={{ margin: "0 0 40px", fontSize: "1.15rem", color: "#94a3b8", lineHeight: 1.65, maxWidth: 520 }}>
              LeadRescue's AI answers every missed call and text within seconds — qualifies the lead, books the appointment, and sends you a summary. You close the job.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link to="/register" style={{ background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", fontWeight: 800, fontSize: "1rem", padding: "14px 28px", borderRadius: 12, textDecoration: "none", boxShadow: "0 8px 24px rgba(16,185,129,0.4)", display: "inline-flex", alignItems: "center", gap: 8, transition: "transform 0.1s, box-shadow 0.15s" }} onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(16,185,129,0.55)"; }} onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 8px 24px rgba(16,185,129,0.4)"; }}>
                Start capturing leads →
              </Link>
              <a href="#pricing" style={{ color: "#94a3b8", fontWeight: 700, fontSize: "1rem", padding: "14px 24px", borderRadius: 12, textDecoration: "none", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", display: "inline-flex", alignItems: "center", transition: "border-color 0.15s, color 0.15s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(16,185,129,0.4)"; e.currentTarget.style.color = "#6ee7b7"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#94a3b8"; }}>
                See pricing
              </a>
            </div>
            <div style={{ marginTop: 40, display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ display: "flex" }}>
                {["🏗️","🔧","🏠","⚡","🔩"].map((e, i) => (
                  <div key={i} style={{ width: 32, height: 32, borderRadius: "50%", background: "#1a2740", border: "2px solid #050d1a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem", marginLeft: i ? -8 : 0 }}>{e}</div>
                ))}
              </div>
              <span style={{ color: "#64748b", fontSize: "0.84rem" }}>Trusted by <strong style={{ color: "#94a3b8" }}>500+</strong> contractors</span>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "center", opacity: heroVisible ? 1 : 0, transform: heroVisible ? "none" : "translateY(20px) scale(0.97)", transition: "all 1s 0.2s cubic-bezier(0.16,1,0.3,1)", animation: heroVisible ? "float-card 6s ease-in-out infinite" : "none" }}>
            <AnimatedChat />
          </div>
        </div>
      </section>

      {/* ── STATS ───────────────────────────────────────────────────────────── */}
      <section ref={statsRef} className="lp-section" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "60px 24px" }}>
        <div className="lp-stats" style={{ maxWidth: 900, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 40 }}>
          {[
            { val: 2, suf: " min", label: "Avg. response time" },
            { val: 94, suf: "%", label: "Lead qualification rate" },
            { val: 3, suf: "×", label: "More booked jobs" },
            { val: 24, suf: "/7", label: "Always answering" },
          ].map(({ val, suf, label }, i) => (
            <div key={i} style={{ textAlign: "center", opacity: statsVisible ? 1 : 0, transform: statsVisible ? "none" : "translateY(20px)", transition: `all 0.6s ${i * 0.1}s` }}>
              <div style={{ fontSize: "2.8rem", fontWeight: 950, background: "linear-gradient(135deg,#10b981,#6ee7b7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", lineHeight: 1 }}>
                {statsVisible ? <Counter target={val} suffix={suf} /> : `0${suf}`}
              </div>
              <div style={{ color: "#64748b", fontSize: "0.85rem", marginTop: 8 }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────────────────── */}
      <section ref={featRef} className="lp-section" style={{ padding: "100px 24px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <div style={{ display: "inline-block", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 99, padding: "5px 14px", fontSize: "0.75rem", fontWeight: 700, color: "#6ee7b7", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>
              How it works
            </div>
            <h2 style={{ margin: "0 0 16px", fontSize: "clamp(1.8rem, 4vw, 3rem)", fontWeight: 900, letterSpacing: "-0.02em" }}>Your business, running 24/7</h2>
            <p style={{ color: "#64748b", fontSize: "1.05rem", maxWidth: 560, margin: "0 auto" }}>From the first ring to the signed job — LeadRescue handles every step automatically.</p>
          </div>
          <div className="lp-grid-2" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
            {features.map((f, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "32px", transition: "all 0.3s", cursor: "default", opacity: featVisible ? 1 : 0, transform: featVisible ? "none" : "translateY(30px)", transitionDelay: `${i * 0.12}s` }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(16,185,129,0.06)"; e.currentTarget.style.borderColor = "rgba(16,185,129,0.25)"; e.currentTarget.style.transform = "translateY(-4px)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; e.currentTarget.style.transform = ""; }}>
                <div style={{ fontSize: "2.2rem", marginBottom: 16 }}>{f.icon}</div>
                <h3 style={{ margin: "0 0 10px", fontSize: "1.1rem", fontWeight: 800, color: "#fff" }}>{f.title}</h3>
                <p style={{ margin: 0, color: "#64748b", lineHeight: 1.65, fontSize: "0.92rem" }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ────────────────────────────────────────────────────── */}
      <section ref={testimonialsRef} className="lp-section" style={{ padding: "80px 24px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: "clamp(1.6rem, 3.5vw, 2.4rem)", fontWeight: 900, letterSpacing: "-0.02em" }}>Contractors love it</h2>
            <p style={{ color: "#64748b", fontSize: "0.95rem" }}>Real results from real businesses.</p>
          </div>
          <div className="lp-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {testimonials.map((t, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "28px 24px", opacity: testimonialsVisible ? 1 : 0, transform: testimonialsVisible ? "none" : "translateY(20px)", transition: `all 0.6s ${i * 0.15}s` }}>
                <div style={{ color: "#10b981", fontSize: "1.8rem", marginBottom: 12, lineHeight: 1 }}>"</div>
                <p style={{ margin: "0 0 20px", color: "#cbd5e1", lineHeight: 1.65, fontSize: "0.92rem" }}>{t.quote}</p>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#fff" }}>{t.name}</div>
                  <div style={{ fontSize: "0.78rem", color: "#475569" }}>{t.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ─────────────────────────────────────────────────────────── */}
      <section id="pricing" ref={pricingRef} className="lp-section" style={{ padding: "100px 24px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <div style={{ display: "inline-block", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 99, padding: "5px 14px", fontSize: "0.75rem", fontWeight: 700, color: "#6ee7b7", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>Pricing</div>
            <h2 style={{ margin: "0 0 12px", fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: 900, letterSpacing: "-0.02em" }}>Simple, transparent pricing</h2>
            <p style={{ color: "#64748b", fontSize: "1rem" }}>Start free. No contracts. Cancel anytime.</p>
          </div>
          <div className="lp-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {plans.map((plan, i) => (
              <div key={plan.name} style={{
                background: plan.highlight ? "linear-gradient(160deg, rgba(16,185,129,0.15) 0%, rgba(16,185,129,0.05) 100%)" : "rgba(255,255,255,0.03)",
                border: plan.highlight ? "1px solid rgba(16,185,129,0.4)" : "1px solid rgba(255,255,255,0.07)",
                borderRadius: 20, padding: "36px 28px", position: "relative",
                boxShadow: plan.highlight ? "0 0 40px rgba(16,185,129,0.15), inset 0 1px 0 rgba(255,255,255,0.1)" : "none",
                opacity: pricingVisible ? 1 : 0, transform: pricingVisible ? "none" : "translateY(30px)",
                transition: `all 0.6s ${i * 0.1}s`
              }}>
                {plan.badge && (
                  <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", fontSize: "0.72rem", fontWeight: 800, padding: "5px 14px", borderRadius: 99, letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{plan.badge}</div>
                )}
                <div style={{ marginBottom: 4, color: "#94a3b8", fontWeight: 700, fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>{plan.name}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, margin: "12px 0" }}>
                  <span style={{ fontSize: "1rem", color: "#64748b", fontWeight: 600 }}>$</span>
                  <span style={{ fontSize: "3.2rem", fontWeight: 950, color: "#fff", letterSpacing: "-0.03em" }}>{plan.price}</span>
                  <span style={{ color: "#475569", fontSize: "0.88rem" }}>/mo</span>
                </div>
                <p style={{ margin: "0 0 28px", color: "#64748b", fontSize: "0.88rem", lineHeight: 1.55 }}>{plan.tagline}</p>
                <ul style={{ margin: "0 0 32px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                  {plan.features.map((f) => (
                    <li key={f} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.88rem", color: "#cbd5e1" }}>
                      <span style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(16,185,129,0.2)", border: "1px solid rgba(16,185,129,0.4)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "0.65rem", color: "#10b981" }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => handleCta(plan)} style={{ width: "100%", padding: "14px", borderRadius: 10, border: plan.highlight ? "none" : "1px solid rgba(255,255,255,0.1)", background: plan.highlight ? "linear-gradient(135deg,#10b981,#059669)" : "rgba(255,255,255,0.05)", color: "#fff", fontWeight: 800, fontSize: "0.95rem", cursor: "pointer", boxShadow: plan.highlight ? "0 6px 20px rgba(16,185,129,0.35)" : "none", transition: "all 0.15s" }}
                  onMouseEnter={e => { e.target.style.transform = "translateY(-1px)"; e.target.style.filter = "brightness(1.08)"; }}
                  onMouseLeave={e => { e.target.style.transform = ""; e.target.style.filter = ""; }}>
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA STRIP ───────────────────────────────────────────────────────── */}
      <section className="lp-section" style={{ padding: "80px 24px", textAlign: "center", background: "linear-gradient(180deg, transparent, rgba(16,185,129,0.05))" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: 950, letterSpacing: "-0.025em" }}>Ready to stop missing leads?</h2>
        <p style={{ color: "#64748b", fontSize: "1.05rem", marginBottom: 36 }}>Set up in under 5 minutes. No credit card required to start.</p>
        <Link to="/register" style={{ background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", fontWeight: 800, fontSize: "1.05rem", padding: "16px 36px", borderRadius: 14, textDecoration: "none", boxShadow: "0 8px 28px rgba(16,185,129,0.45)", display: "inline-flex", alignItems: "center", gap: 10, transition: "transform 0.1s, box-shadow 0.15s" }} onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 12px 36px rgba(16,185,129,0.6)"; }} onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 8px 28px rgba(16,185,129,0.45)"; }}>
          Start for free — takes 5 minutes →
        </Link>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "40px 24px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: "linear-gradient(135deg,#10b981,#059669)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: "0.72rem", color: "#fff" }}>LR</div>
            <span style={{ fontWeight: 700, color: "#fff", fontSize: "0.95rem" }}>LeadRescue</span>
          </div>
          <p style={{ color: "#334155", fontSize: "0.82rem", margin: 0 }}>© {new Date().getFullYear()} LeadRescue. All rights reserved.</p>
          <div style={{ display: "flex", gap: 20 }}>
            <Link to="/privacy" style={{ color: "#475569", fontSize: "0.82rem", textDecoration: "none", transition: "color 0.15s" }} onMouseEnter={e => e.target.style.color = "#10b981"} onMouseLeave={e => e.target.style.color = "#475569"}>Privacy</Link>
            <Link to="/terms" style={{ color: "#475569", fontSize: "0.82rem", textDecoration: "none", transition: "color 0.15s" }} onMouseEnter={e => e.target.style.color = "#10b981"} onMouseLeave={e => e.target.style.color = "#475569"}>Terms</Link>
            <a href="mailto:hello@leadrescue.com" style={{ color: "#475569", fontSize: "0.82rem", textDecoration: "none", transition: "color 0.15s" }} onMouseEnter={e => e.target.style.color = "#10b981"} onMouseLeave={e => e.target.style.color = "#475569"}>Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
