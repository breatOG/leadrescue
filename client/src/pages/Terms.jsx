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

export default function Terms() {
  return (
    <div style={s.page}>
      <Link to="/" style={s.back}>← Back to LeadRescue</Link>
      <span style={s.brand}>LeadRescue</span>
      <h1 style={s.h1}>Terms of Service</h1>
      <span style={s.date}>Effective date: {EFFECTIVE}</span>

      <p style={s.p}>These Terms of Service ("Terms") govern your use of LeadRescue ("Service"), operated by LeadRescue ("we," "us," or "our"). By creating an account or using the Service, you agree to be bound by these Terms. If you do not agree, do not use the Service.</p>

      <h2 style={s.h2}>1. Description of Service</h2>
      <p style={s.p}>LeadRescue is a B2B SaaS platform that helps local service businesses automatically respond to missed calls and inbound texts using AI, qualify leads, and schedule appointments. The platform includes an AI SMS assistant, AI voice response, a lead management dashboard, appointment calendar, and subscription-based billing.</p>

      <h2 style={s.h2}>2. Account Registration</h2>
      <p style={s.p}>You must be at least 18 years old and authorized to operate a business to use LeadRescue. You agree to provide accurate, current, and complete information when creating your account and to keep it updated. You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account.</p>
      <p style={s.p}>Each account is for a single business entity. You may add staff users to your account, but you remain responsible for their compliance with these Terms.</p>

      <h2 style={s.h2}>3. Subscription Plans and Billing</h2>
      <p style={s.p}>LeadRescue offers three subscription tiers: Starter, Pro, and Scale. Each plan includes a monthly lead limit and a defined set of features as described on our pricing page.</p>
      <p style={s.p}><strong>Billing:</strong> Subscriptions are billed monthly in advance via Stripe. By subscribing, you authorize us to charge your payment method on a recurring monthly basis.</p>
      <p style={s.p}><strong>Auto-renewal:</strong> Your subscription automatically renews each month on the same date until you cancel. We will send a reminder email before each renewal. You can cancel at any time from your billing settings.</p>
      <p style={s.p}><strong>Upgrades and downgrades:</strong> Plan changes take effect immediately. Upgrades are prorated; downgrades take effect at the next billing cycle.</p>
      <p style={s.p}><strong>Refunds:</strong> We do not offer refunds for partial months or unused portions of a subscription. If you cancel, you retain access until the end of your current billing period.</p>
      <p style={s.p}><strong>Failed payments:</strong> If a payment fails, your account will be placed in a past-due state. We will retry the payment and notify you by email. Access to the Service may be suspended if payment is not resolved within 7 days.</p>

      <h2 style={s.h2}>4. Lead Limits and Plan Features</h2>
      <p style={s.p}>Each plan includes a monthly lead limit. A "lead" is counted when a new inbound contact (a customer who has not previously interacted with your account in the current billing month) initiates contact via SMS or voice call. Existing open leads are not re-counted.</p>
      <p style={s.p}>When your monthly lead limit is reached, new inbound contacts will receive a polite capacity message and will not be added to your dashboard. Existing leads and conversations continue uninterrupted. Limits reset at the start of each billing cycle.</p>
      <p style={s.p}>Voice AI is available on Pro and Scale plans only. Multiple business locations are available on Scale plans only.</p>

      <h2 style={s.h2}>5. Acceptable Use</h2>
      <p style={s.p}>You agree to use LeadRescue only for lawful business purposes. You may not:</p>
      <ul style={s.ul}>
        <li style={s.li}>Use the Service to send unsolicited messages (spam) or to contact individuals who have not initiated contact with your business</li>
        <li style={s.li}>Use the Service to harass, threaten, or deceive customers or any third party</li>
        <li style={s.li}>Misrepresent your business, services, pricing, or credentials to customers through the AI system</li>
        <li style={s.li}>Attempt to reverse-engineer, scrape, or extract data from the Service in an unauthorized manner</li>
        <li style={s.li}>Use the Service in any way that violates applicable law, including the TCPA, CAN-SPAM Act, or carrier guidelines</li>
        <li style={s.li}>Resell or sublicense the Service without our written consent</li>
      </ul>

      <h2 style={s.h2}>6. SMS Messaging Compliance</h2>
      <p style={s.p}>By using LeadRescue's SMS features, you represent and warrant that:</p>
      <ul style={s.ul}>
        <li style={s.li}>You have obtained the required A2P 10DLC registration for your messaging campaign, or you will complete it promptly through the LeadRescue platform</li>
        <li style={s.li}>SMS messages are sent only to customers who have provided explicit written consent via a web form containing a clear opt-in checkbox, in accordance with CTIA guidelines and the Telephone Consumer Protection Act (TCPA)</li>
        <li style={s.li}>Your opt-in forms include the required disclosure: "Message frequency varies. Msg & data rates may apply. Reply STOP to opt out or HELP for help."</li>
        <li style={s.li}>Your use of SMS messaging complies with the TCPA, CTIA messaging guidelines, and all applicable federal, state, and carrier regulations</li>
        <li style={s.li}>You will honor all customer opt-out (STOP) requests immediately and will not send further messages to opted-out numbers</li>
        <li style={s.li}>You will not use the Service to send messages to individuals who have previously opted out or who have not provided explicit consent</li>
      </ul>
      <p style={s.p}>LeadRescue is not responsible for carrier filtering, message delivery failures, or regulatory penalties that result from your failure to maintain compliant A2P registration, proper opt-in collection, or SMS best practices.</p>

      <h2 style={s.h2}>7. AI Services and Limitations</h2>
      <p style={s.p}>LeadRescue uses AI language models to generate responses on behalf of your business. You acknowledge that:</p>
      <ul style={s.ul}>
        <li style={s.li}>AI responses are generated automatically and may not always be perfectly accurate, complete, or appropriate for every situation</li>
        <li style={s.li}>You are responsible for reviewing AI-collected lead information and following up with customers appropriately</li>
        <li style={s.li}>The AI will not provide quotes, pricing estimates, or guarantees on your behalf</li>
        <li style={s.li}>You remain solely responsible for all customer relationships, service commitments, and any representations made through the platform</li>
      </ul>

      <h2 style={s.h2}>8. Twilio Phone Numbers</h2>
      <p style={s.p}>Phone numbers provisioned through LeadRescue are subject to Twilio's Terms of Service. You are responsible for ensuring that any number you provision or connect is used in compliance with applicable telecommunications law. We reserve the right to suspend your number if we receive notice of abuse or regulatory non-compliance.</p>

      <h2 style={s.h2}>9. Data and Privacy</h2>
      <p style={s.p}>Your use of the Service is subject to our <Link to="/privacy" style={{ color: "#2563eb" }}>Privacy Policy</Link>, which is incorporated into these Terms by reference. You represent that you have a lawful basis for providing customer data to the Service and for allowing us to process it on your behalf.</p>

      <h2 style={s.h2}>10. Intellectual Property</h2>
      <p style={s.p}>LeadRescue and its technology, branding, and content are owned by us and protected by intellectual property law. We grant you a limited, non-exclusive, non-transferable license to use the Service for your business during your subscription term. You retain ownership of your business data, customer conversation data, and any content you provide to the Service.</p>

      <h2 style={s.h2}>11. Termination</h2>
      <p style={s.p}>You may cancel your subscription at any time through the billing portal. We may suspend or terminate your account immediately if you violate these Terms, fail to pay, or engage in fraudulent or abusive activity. Upon termination, your data will be retained for 90 days and then permanently deleted, except where retention is required by law.</p>

      <h2 style={s.h2}>12. Disclaimer of Warranties</h2>
      <p style={s.p}>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT AI RESPONSES WILL BE ACCURATE OR APPROPRIATE.</p>

      <h2 style={s.h2}>13. Limitation of Liability</h2>
      <p style={s.p}>TO THE MAXIMUM EXTENT PERMITTED BY LAW, LEADRESCUE AND ITS OFFICERS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, REVENUE, CUSTOMERS, OR DATA, ARISING FROM YOUR USE OF THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. OUR TOTAL LIABILITY TO YOU FOR ANY CLAIM SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE THREE MONTHS PRECEDING THE CLAIM.</p>

      <h2 style={s.h2}>14. Indemnification</h2>
      <p style={s.p}>You agree to indemnify and hold harmless LeadRescue and its officers, employees, and agents from any claims, damages, losses, or expenses (including reasonable legal fees) arising from your use of the Service, your violation of these Terms, your violation of applicable law (including TCPA), or any dispute between you and a customer.</p>

      <h2 style={s.h2}>15. Governing Law and Disputes</h2>
      <p style={s.p}>These Terms are governed by the laws of the State of Indiana, without regard to conflict of law principles. Any dispute arising from these Terms or your use of the Service shall first be addressed through good-faith negotiation. If unresolved, disputes shall be submitted to binding arbitration in Indianapolis, Indiana under the rules of the American Arbitration Association, except that either party may seek injunctive relief in court for intellectual property violations.</p>

      <h2 style={s.h2}>16. Changes to These Terms</h2>
      <p style={s.p}>We may update these Terms from time to time. We will notify you by email and by posting the updated Terms in the platform at least 14 days before changes take effect. Continued use of the Service after the effective date constitutes your acceptance of the revised Terms.</p>

      <h2 style={s.h2}>17. Contact Us</h2>
      <p style={s.p}>For questions about these Terms:</p>
      <ul style={s.ul}>
        <li style={s.li}><strong>Email:</strong> legal@leadrescue.com</li>
        <li style={s.li}><strong>Website:</strong> leadrescue.com</li>
      </ul>

      <hr style={s.divider} />
      <p style={s.footer}>© {new Date().getFullYear()} LeadRescue. All rights reserved. · <Link to="/privacy" style={{ color: "#2563eb" }}>Privacy Policy</Link></p>
    </div>
  );
}
