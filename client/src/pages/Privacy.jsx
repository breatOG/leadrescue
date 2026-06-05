import { Link } from "react-router-dom";

const EFFECTIVE = "June 1, 2026";

const s = {
  page: { fontFamily: "system-ui, -apple-system, sans-serif", color: "#111827", lineHeight: 1.7, maxWidth: 760, margin: "0 auto", padding: "48px 24px 80px" },
  back: { display: "inline-flex", alignItems: "center", gap: 6, color: "#2563eb", textDecoration: "none", fontSize: "0.875rem", fontWeight: 600, marginBottom: 32 },
  brand: { fontSize: "1.1rem", fontWeight: 800, color: "#2563eb", marginBottom: 8, display: "block" },
  h1: { fontSize: "2rem", fontWeight: 800, margin: "0 0 8px" },
  date: { color: "#6b7280", fontSize: "0.9rem", marginBottom: 40, display: "block" },
  h2: { fontSize: "1.15rem", fontWeight: 700, marginTop: 40, marginBottom: 8, color: "#111827" },
  p: { margin: "0 0 14px", color: "#374151" },
  ul: { paddingLeft: 20, margin: "0 0 14px", color: "#374151" },
  li: { marginBottom: 6 },
  divider: { border: "none", borderTop: "1px solid #e5e7eb", margin: "40px 0" },
  footer: { color: "#6b7280", fontSize: "0.875rem" }
};

export default function Privacy() {
  return (
    <div style={s.page}>
      <Link to="/" style={s.back}>← Back to LeadRescue</Link>
      <span style={s.brand}>LeadRescue</span>
      <h1 style={s.h1}>Privacy Policy</h1>
      <span style={s.date}>Effective date: {EFFECTIVE}</span>

      <p style={s.p}>LeadRescue ("we," "us," or "our") operates an AI-powered lead recovery platform for local service businesses. This Privacy Policy explains how we collect, use, disclose, and protect information when you use our platform and when your customers interact with our automated messaging system.</p>

      <h2 style={s.h2}>1. Information We Collect</h2>
      <p style={s.p}><strong>Business account information:</strong> When you create an account, we collect your name, email address, phone number, business name, industry type, service areas, and billing information.</p>
      <p style={s.p}><strong>Customer contact information:</strong> When a customer calls or texts your LeadRescue business number, we collect their phone number, name (when provided), service request details, address or ZIP code, and appointment preferences.</p>
      <p style={s.p}><strong>Conversation data:</strong> We store the full text of SMS and voice conversations between your AI assistant and your customers, including inbound messages, AI-generated responses, and appointment details.</p>
      <p style={s.p}><strong>Usage and technical data:</strong> We collect information about how you use the platform, including login timestamps, pages visited, API requests, and error logs.</p>
      <p style={s.p}><strong>Payment information:</strong> Billing details are collected and processed by Stripe. We do not store full credit card numbers.</p>

      <h2 style={s.h2}>2. How We Use Information</h2>
      <ul style={s.ul}>
        <li style={s.li}>Deliver and improve the LeadRescue service, including AI conversation processing, lead qualification, and appointment scheduling</li>
        <li style={s.li}>Respond to missed calls and inbound texts on behalf of your business</li>
        <li style={s.li}>Send you account notifications, billing receipts, subscription renewal reminders, and service updates</li>
        <li style={s.li}>Detect and prevent fraud, abuse, or violation of our Terms of Service</li>
        <li style={s.li}>Comply with legal obligations, including telecommunications regulations</li>
        <li style={s.li}>Provide customer support and respond to your inquiries</li>
      </ul>

      <h2 style={s.h2}>3. SMS Messaging and Customer Consent</h2>
      <p style={s.p}>LeadRescue sends SMS messages only to customers who have provided explicit written consent. Consent is collected through a web form on the business website or a LeadRescue-hosted contact page, where the customer checks a required box stating: "I agree to receive SMS messages from [Business Name] regarding my service request, appointment scheduling, and service updates. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out or HELP for help." No SMS message is sent until the customer has checked this box and submitted the form.</p>
      <p style={s.p}><strong>Message frequency:</strong> Typically 1–6 messages per service request, depending on the conversation and appointment scheduling needs.</p>
      <p style={s.p}><strong>Message and data rates may apply</strong> based on the customer's mobile carrier plan.</p>
      <p style={s.p}><strong>Opt-out:</strong> Customers can reply STOP at any time to stop receiving messages. They may also reply HELP for assistance. LeadRescue honors all opt-out requests immediately and will not send further messages to opted-out numbers.</p>
      <p style={s.p}><strong>Opt-in keywords:</strong> Customers may also text START, YES, or JOIN to opt in to messages from a business number.</p>
      <p style={s.p}><strong>Mobile number non-sharing:</strong> We do not sell, rent, share, or transfer customer mobile phone numbers or SMS consent to any third party for marketing or promotional purposes.</p>

      <h2 style={s.h2}>4. AI Processing</h2>
      <p style={s.p}>Conversation content may be processed by OpenAI's API to generate AI responses and extract lead information such as name, job type, address, and urgency. This data is used only to provide the service and is not used to train OpenAI's models under our API agreement. We do not share personally identifiable customer information with OpenAI beyond what is necessary to generate a response.</p>

      <h2 style={s.h2}>5. Third-Party Service Providers</h2>
      <p style={s.p}>We use the following third-party services to operate LeadRescue:</p>
      <ul style={s.ul}>
        <li style={s.li}><strong>Twilio</strong> — Phone number provisioning, SMS delivery, and voice call handling</li>
        <li style={s.li}><strong>OpenAI</strong> — AI language model processing for conversation responses</li>
        <li style={s.li}><strong>Stripe</strong> — Subscription billing and payment processing</li>
        <li style={s.li}><strong>Railway / hosting provider</strong> — Cloud infrastructure and database hosting</li>
        <li style={s.li}><strong>Resend / SMTP provider</strong> — Transactional email delivery</li>
      </ul>
      <p style={s.p}>Each provider has their own privacy practices. We only share information with these providers as necessary to deliver the service.</p>

      <h2 style={s.h2}>6. Data Retention</h2>
      <p style={s.p}>We retain business account data for the duration of your subscription and for up to 90 days after account closure, after which it is permanently deleted. Customer conversation data is retained for as long as your account is active. You may request deletion of your account and associated data at any time by contacting us.</p>

      <h2 style={s.h2}>7. Data Security</h2>
      <p style={s.p}>We use industry-standard security measures including encrypted connections (TLS), hashed passwords (bcrypt), and JWT-based authentication. No method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.</p>

      <h2 style={s.h2}>8. Children's Privacy</h2>
      <p style={s.p}>LeadRescue is a business-to-business platform intended for use by adults operating service businesses. We do not knowingly collect personal information from children under 13.</p>

      <h2 style={s.h2}>9. Your Rights</h2>
      <p style={s.p}>Depending on your location, you may have rights to access, correct, delete, or export your personal data. To exercise these rights, contact us at the address below. We will respond within 30 days.</p>

      <h2 style={s.h2}>10. Changes to This Policy</h2>
      <p style={s.p}>We may update this Privacy Policy from time to time. We will notify you of significant changes by email or by posting a notice in the platform at least 7 days before the change takes effect. Continued use of the service after the effective date constitutes acceptance of the revised policy.</p>

      <h2 style={s.h2}>11. Contact Us</h2>
      <p style={s.p}>For privacy questions, data requests, or to report a concern:</p>
      <ul style={s.ul}>
        <li style={s.li}><strong>Email:</strong> privacy@leadrescue.com</li>
        <li style={s.li}><strong>Website:</strong> leadrescue.com</li>
      </ul>

      <hr style={s.divider} />
      <p style={s.footer}>© {new Date().getFullYear()} LeadRescue. All rights reserved. · <Link to="/terms" style={{ color: "#2563eb" }}>Terms of Service</Link></p>
    </div>
  );
}
