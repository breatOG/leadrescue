export const BUSINESS_TIME_ZONE = import.meta.env.VITE_BUSINESS_TIMEZONE || "America/Indiana/Indianapolis";

export function formatBusinessDateTime(value, options = {}) {
  return new Date(value).toLocaleString("en-US", { timeZone: BUSINESS_TIME_ZONE, ...options });
}

export function formatBusinessDate(value, options = {}) {
  return new Date(value).toLocaleDateString("en-US", { timeZone: BUSINESS_TIME_ZONE, ...options });
}

export function formatBusinessTime(value, options = {}) {
  return new Date(value).toLocaleTimeString("en-US", { timeZone: BUSINESS_TIME_ZONE, ...options });
}

export function businessDateKey(value) {
  return formatBusinessDate(value, { year: "numeric", month: "2-digit", day: "2-digit" });
}
