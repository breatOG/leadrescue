import { getUser } from "../api/client.js";

export function shouldRedactPhones() {
  return getUser()?.email?.toLowerCase() === "breataronov@gmail.com";
}

export function shouldRedactDemoDetails() {
  return shouldRedactPhones();
}

function firstNameOnly(name) {
  return String(name || "").trim().split(/\s+/)[0] || name;
}

export function redactDemoText(value) {
  if (!shouldRedactDemoDetails()) return value;
  return String(value || "")
    .replace(/\b\d{1,6}\s+[A-Z][A-Za-z0-9.'-]*(?:\s+[A-Z][A-Za-z0-9.'-]*){0,5}\s+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Way|Ct|Court|Place|Pl|Circle|Cir)\b\.?/g, "[address hidden]")
    .replace(/\b\d{5}(?:-\d{4})?\b/g, "[ZIP hidden]");
}

export function PhoneText({ children, className = "", style }) {
  const redacted = shouldRedactPhones();
  return (
    <span className={`${className} ${redacted ? "redacted-phone" : ""}`.trim()} style={style}>
      {children}
    </span>
  );
}

export function AddressText({ children, className = "", style }) {
  const redacted = shouldRedactDemoDetails();
  return (
    <span className={`${className} ${redacted ? "redacted-address" : ""}`.trim()} style={style}>
      {children}
    </span>
  );
}

export function DemoSafeText({ children, className = "", style }) {
  return <span className={className} style={style}>{redactDemoText(children)}</span>;
}

export function LeadName({ lead, fallback = "Unknown customer", className = "", style }) {
  if (lead?.customerName) {
    return <span className={className} style={style}>{shouldRedactDemoDetails() ? firstNameOnly(lead.customerName) : lead.customerName}</span>;
  }
  if (lead?.customerPhone) return <PhoneText className={className} style={style}>{lead.customerPhone}</PhoneText>;
  return <span className={className} style={style}>{fallback}</span>;
}

export function displayLeadName(lead, fallback = "Unknown customer") {
  if (lead?.customerName) return shouldRedactDemoDetails() ? firstNameOnly(lead.customerName) : lead.customerName;
  return lead?.customerPhone || fallback;
}

export function displayLeadInitial(lead) {
  return (lead?.customerName || (shouldRedactPhones() ? "?" : lead?.customerPhone) || "?")[0].toUpperCase();
}
