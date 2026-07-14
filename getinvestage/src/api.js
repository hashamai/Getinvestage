/* API client.
 *
 * The access token lives in module memory — deliberately NOT in localStorage.
 * localStorage is readable by any script on the page, so an XSS bug there
 * hands an attacker a working credential. The cost of keeping it in memory is
 * that a page reload loses it, which is exactly what refreshSession() below is
 * for: the httpOnly refresh cookie (which JS cannot read) mints a new one.
 */

let accessToken = null;

export const setAccessToken = (token) => {
  accessToken = token;
};

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }

  static async from(resp) {
    let detail = resp.statusText;
    try {
      const body = await resp.json();
      // FastAPI puts a string in `detail` for HTTPException, and a list of
      // field errors there for a 422 validation failure.
      if (typeof body.detail === 'string') detail = body.detail;
      else if (Array.isArray(body.detail)) detail = body.detail[0]?.msg ?? detail;
    } catch {
      /* non-JSON error body — keep the status text */
    }
    return new ApiError(resp.status, detail);
  }
}

/* A single in-flight refresh, shared by every caller. Without this, five
 * requests expiring at once would fire five refreshes and rotate the cookie
 * out from under each other. */
let refreshInFlight = null;

export function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    })
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data) => {
        if (data) setAccessToken(data.access_token);
        return data;
      })
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function request(path, { method = 'GET', body, auth = true, retried = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const resp = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'include', // carries the httpOnly refresh cookie
  });

  // Access tokens are short-lived by design. A 401 usually just means "expired",
  // so refresh once and replay the request. The user never sees it.
  if (resp.status === 401 && auth && !retried) {
    const refreshed = await refreshSession();
    if (refreshed) return request(path, { method, body, auth, retried: true });
  }

  if (!resp.ok) throw await ApiError.from(resp);
  if (resp.status === 204) return null;
  return resp.json();
}

export const api = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, body, opts) => request(path, { method: 'POST', body, ...opts }),
  del: (path) => request(path, { method: 'DELETE' }),
};
