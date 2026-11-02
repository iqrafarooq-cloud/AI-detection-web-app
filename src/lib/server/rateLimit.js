// Fixed-window in-memory rate limiter keyed by client IP + bucket.
//
// On serverless platforms each instance keeps its own memory, so limits are
// per instance. For strict global limits put a shared store (e.g. Redis /
// Upstash) behind this same interface - see README "Rate limiting".

const buckets = new Map();
const MAX_KEYS = 10_000;

export function getClientIp(request) {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

export function rateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry || now >= entry.resetAt) {
    if (buckets.size > MAX_KEYS) {
      for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
    }
    entry = { count: 0, resetAt: now + windowMs };
    buckets.set(key, entry);
  }
  entry.count++;
  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
  };
}

export function _resetRateLimits() {
  buckets.clear();
}
