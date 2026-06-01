import { Resend } from "resend";
import nodemailer from "nodemailer";

// `from` differs per transport: SMTP sends from your own address; Resend (without a
// verified domain) must send from onboarding@resend.dev.
const smtpFrom = process.env.EMAIL_FROM || process.env.SMTP_USER;
const resendFrom = process.env.RESEND_FROM || "LeadRescue <onboarding@resend.dev>";

// --- Transport selection ---
// 1. SMTP (e.g. Gmail) if SMTP_HOST/USER/PASS are set — sends to ANY recipient, no domain needed.
// 2. Resend if RESEND_API_KEY is set — needs a verified domain to send to arbitrary recipients.
// 3. Console fallback otherwise — logs the link locally.
const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const resendKey = process.env.RESEND_API_KEY;

const smtpTransport = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: Number(process.env.SMTP_PORT || 465) === 465, // 465 = SSL, 587 = STARTTLS
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    })
  : null;

const resend = resendKey ? new Resend(resendKey) : null;

export function hasEmailConfig() {
  return Boolean(smtpTransport || resend);
}

export function emailMode() {
  if (smtpTransport) return "smtp";
  if (resend) return "resend";
  return "mock";
}

// Sends an email via SMTP or Resend, or logs it to the console in mock mode.
async function deliver({ to, subject, html, text, logLine }) {
  if (smtpTransport) {
    await smtpTransport.sendMail({ from: smtpFrom, to, subject, html, text });
    return { mode: "smtp" };
  }

  if (resend) {
    const { error } = await resend.emails.send({ from: resendFrom, to, subject, html, text });
    if (error) {
      console.error("[email] Resend error:", error);
      throw new Error(typeof error.message === "string" ? error.message : "Failed to send email");
    }
    return { mode: "resend" };
  }

  console.log(`[mock email] to=${to} | ${subject}`);
  console.log(`[mock email] ${logLine}`);
  return { mode: "mock" };
}

function layout(title, bodyHtml) {
  return `<!doctype html>
<html lang="en">
  <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #172033; max-width: 480px; margin: 0 auto; padding: 24px;">
    <h1 style="font-size: 20px;">${title}</h1>
    ${bodyHtml}
    <p style="color: #6b7280; font-size: 12px; margin-top: 32px;">If you didn't request this, you can safely ignore this email.</p>
  </body>
</html>`;
}

export async function sendVerificationEmail({ to, name, link }) {
  const greeting = name ? `Hi ${name},` : "Hi,";
  return deliver({
    to,
    subject: "Verify your LeadRescue email",
    logLine: `Verify email link: ${link}`,
    text: `${greeting}\n\nConfirm your email to finish setting up LeadRescue:\n${link}\n\nThis link expires in 24 hours.`,
    html: layout(
      "Verify your email",
      `<p>${greeting}</p>
       <p>Confirm your email to finish setting up your LeadRescue account.</p>
       <p><a href="${link}" style="display:inline-block; background:#2563eb; color:#fff; padding:10px 18px; border-radius:8px; text-decoration:none;">Verify email</a></p>
       <p style="color:#6b7280; font-size:13px;">This link expires in 24 hours.</p>`
    )
  });
}

export async function sendInviteEmail({ to, name, businessName, inviterName, link }) {
  const greeting = name ? `Hi ${name},` : "Hi,";
  return deliver({
    to,
    subject: `${inviterName} invited you to join ${businessName} on LeadRescue`,
    logLine: `Invite link: ${link}`,
    text: `${greeting}\n\n${inviterName} has invited you to join ${businessName} on LeadRescue — an AI lead recovery platform.\n\nAccept your invitation here:\n${link}\n\nThis link expires in 72 hours.`,
    html: layout(
      `You're invited to join ${businessName}`,
      `<p>${greeting}</p>
       <p><strong>${inviterName}</strong> has invited you to join <strong>${businessName}</strong> on LeadRescue.</p>
       <p>Click below to set up your account and start managing leads together.</p>
       <p><a href="${link}" style="display:inline-block; background:#0f766e; color:#fff; padding:12px 22px; border-radius:8px; text-decoration:none; font-weight:700;">Accept invitation</a></p>
       <p style="color:#6b7280; font-size:13px;">This link expires in 72 hours. If you didn't expect this, you can safely ignore it.</p>`
    )
  });
}

export async function sendRenewalReminderEmail({ to, name, renewalDate, plan, amountCents }) {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const planLabel = { starter: "Starter", pro: "Pro", scale: "Scale" }[plan] || (plan || "your");
  const date = new Date(renewalDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const amount = amountCents ? `$${(amountCents / 100).toFixed(2)}` : "your subscription amount";
  const baseUrl = (process.env.APP_BASE_URL || "https://leadrescue.com").replace(/\/$/, "");

  return deliver({
    to,
    subject: `Your LeadRescue ${planLabel} plan renews on ${date}`,
    logLine: `Renewal reminder: ${planLabel} plan renews on ${date} for ${amount}`,
    text: `${greeting}\n\nYour LeadRescue ${planLabel} plan will automatically renew on ${date} for ${amount}.\n\nTo upgrade, downgrade, or cancel, visit your billing settings at ${baseUrl}/settings.\n\nThank you for using LeadRescue!`,
    html: layout(
      `Your ${planLabel} plan renews on ${date}`,
      `<p>${greeting}</p>
       <p>Your LeadRescue <strong>${planLabel} plan</strong> will automatically renew on <strong>${date}</strong> for <strong>${amount}</strong>.</p>
       <p>If you'd like to change or cancel your subscription before then, you can do it from your billing settings.</p>
       <p><a href="${baseUrl}/settings" style="display:inline-block; background:#2563eb; color:#fff; padding:10px 18px; border-radius:8px; text-decoration:none;">Manage billing</a></p>
       <p style="color:#6b7280; font-size:13px;">If you don't do anything, your subscription will renew automatically — no action needed.</p>`
    )
  });
}

export async function sendPasswordResetEmail({ to, name, link }) {
  const greeting = name ? `Hi ${name},` : "Hi,";
  return deliver({
    to,
    subject: "Reset your LeadRescue password",
    logLine: `Password reset link: ${link}`,
    text: `${greeting}\n\nReset your LeadRescue password using the link below:\n${link}\n\nThis link expires in 1 hour. If you didn't request it, ignore this email.`,
    html: layout(
      "Reset your password",
      `<p>${greeting}</p>
       <p>We received a request to reset your LeadRescue password.</p>
       <p><a href="${link}" style="display:inline-block; background:#2563eb; color:#fff; padding:10px 18px; border-radius:8px; text-decoration:none;">Reset password</a></p>
       <p style="color:#6b7280; font-size:13px;">This link expires in 1 hour.</p>`
    )
  });
}
