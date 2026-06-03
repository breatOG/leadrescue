const KEY = "lr_seen";

function getStore() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}

export function markLeadSeen(leadId) {
  const store = getStore();
  store[leadId] = new Date().toISOString();
  localStorage.setItem(KEY, JSON.stringify(store));
}

// Returns true if the lead has activity newer than the last time the user opened it.
export function isLeadNew(lead) {
  if (!lead) return false;
  const seenAt = getStore()[lead.id];
  if (!seenAt) return true;
  return new Date(lead.updatedAt) > new Date(seenAt);
}
