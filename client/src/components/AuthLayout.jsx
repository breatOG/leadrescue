import { Link } from "react-router-dom";
import { Check } from "lucide-react";

const POINTS = [
  "Instant missed-call text-back",
  "AI qualifies every lead, 24/7",
  "Appointments booked automatically"
];

// Shared split-screen shell for all auth pages: brand panel on the left, form on the right.
export default function AuthLayout({ eyebrow, title, subtitle, children, footer }) {
  return (
    <div className="auth-split">
      <aside className="auth-aside">
        <Link to="/" className="brand">
          <img src="/logo.png" alt="LeadRescue" className="brand-mark" /> LeadRescue
        </Link>

        <div>
          <h2 className="auth-aside-headline">Turn missed calls into booked jobs.</h2>
          <p className="auth-aside-sub">
            LeadRescue answers every missed call with an instant text, qualifies the lead with AI,
            and books the appointment — so you never lose work again.
          </p>
          <ul className="auth-points">
            {POINTS.map((point) => (
              <li key={point}>
                <span className="auth-check"><Check size={15} strokeWidth={3} /></span>
                {point}
              </li>
            ))}
          </ul>
        </div>

        <p className="auth-aside-foot">© {new Date().getFullYear()} LeadRescue. Built for local service pros.</p>
      </aside>

      <main className="auth-main">
        <div className="auth-box">
          <Link to="/" className="brand">
            <img src="/logo.png" alt="LeadRescue" className="brand-mark" /> LeadRescue
          </Link>
          {eyebrow && <p className="auth-eyebrow">{eyebrow}</p>}
          <h1 className="auth-title">{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
          {children}
          {footer && <p className="auth-foot">{footer}</p>}
        </div>
      </main>
    </div>
  );
}
