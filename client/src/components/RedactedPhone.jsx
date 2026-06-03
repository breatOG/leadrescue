import { getUser } from "../api/client.js";

export function shouldRedactPhones() {
  return getUser()?.email?.toLowerCase() === "breataronov@gmail.com";
}

export function PhoneText({ children, className = "", style }) {
  const redacted = shouldRedactPhones();
  return (
    <span className={`${className} ${redacted ? "redacted-phone" : ""}`.trim()} style={style}>
      {children}
    </span>
  );
}

export function LeadName({ lead, fallback = "Unknown customer", className = "", style }) {
  if (lead?.customerName) return <span className={className} style={style}>{lead.customerName}</span>;
  if (lead?.customerPhone) return <PhoneText className={className} style={style}>{lead.customerPhone}</PhoneText>;
  return <span className={className} style={style}>{fallback}</span>;
}

export function displayLeadName(lead, fallback = "Unknown customer") {
  if (lead?.customerName) return lead.customerName;
  return lead?.customerPhone || fallback;
}

export function displayLeadInitial(lead) {
  return (lead?.customerName || (shouldRedactPhones() ? "?" : lead?.customerPhone) || "?")[0].toUpperCase();
}
