// Small fetch wrapper that turns every failure into a user-readable message.

export class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function handle(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new ApiError(
      body?.error?.message || `Request failed (HTTP ${res.status}). Please try again.`,
      body?.error?.code || "http_error",
      res.status
    );
  }
  return body;
}

function networkError(err) {
  if (err?.name === "AbortError") return err;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return new ApiError("You appear to be offline. Check your connection and try again.", "offline", 0);
  }
  return new ApiError("Network error - the server could not be reached. Please try again.", "network", 0);
}

export async function postJson(url, data, { signal } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal,
    });
  } catch (err) {
    throw networkError(err);
  }
  return handle(res);
}

export async function postForm(url, formData, { signal } = {}) {
  let res;
  try {
    res = await fetch(url, { method: "POST", body: formData, signal });
  } catch (err) {
    throw networkError(err);
  }
  return handle(res);
}

export async function getJson(url) {
  let res;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (err) {
    throw networkError(err);
  }
  return handle(res);
}
