// Thin fetch wrapper that attaches the JWT and unwraps JSON / errors.
const TOKEN_KEY = "remedy-token";
const BRANCH_KEY = "remedy-branch";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// Oversight branch lens — when set, GET reads are scoped to this branch.
let activeBranch = localStorage.getItem(BRANCH_KEY) || null;
export const getActiveBranch = () => activeBranch;
export const setActiveBranch = (id) => {
  activeBranch = id || null;
  if (activeBranch) localStorage.setItem(BRANCH_KEY, activeBranch);
  else localStorage.removeItem(BRANCH_KEY);
};

// Download an authenticated file (PDF, etc.) — fetches with the JWT, then saves
// the blob (a plain <a href> can't send the auth header).
export async function downloadFile(path, filename) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (activeBranch) headers["X-Branch-Id"] = activeBranch;
  const res = await fetch(path, { headers });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || path.split("/").pop();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function api(path, { method = "GET", body, params } = {}) {
  const url = new URL(path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
    });
  }
  // Auto-scope GET reads to the selected oversight branch.
  if (method === "GET" && activeBranch && !url.searchParams.has("branch_id")) {
    url.searchParams.set("branch_id", activeBranch);
  }
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  // Scope writes to the active branch too, so stock never lands in a sister branch.
  if (activeBranch) headers["X-Branch-Id"] = activeBranch;

  const res = await fetch(url.pathname + url.search, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    // Session expired / invalid token → drop credentials and bounce to login,
    // unless this *is* the login call itself.
    if (res.status === 401 && getToken() && !path.includes("/auth/login")) {
      clearToken();
      if (window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    }
    const err = new Error((data && data.message) || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
