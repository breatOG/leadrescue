const API_URL = import.meta.env.VITE_API_URL || "";

export function getToken() {
  return localStorage.getItem("leadrescue_token");
}

export function setToken(token) {
  if (token) localStorage.setItem("leadrescue_token", token);
  else localStorage.removeItem("leadrescue_token");
}

export function getUser() {
  try {
    const raw = localStorage.getItem("leadrescue_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setUser(user) {
  if (user) localStorage.setItem("leadrescue_user", JSON.stringify(user));
  else localStorage.removeItem("leadrescue_user");
}

export function isSubscribed() {
  const user = getUser();
  return user?.subscriptionStatus === "active";
}

export async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(typeof error.error === "string" ? error.error : "Request failed");
  }

  return response.json();
}
