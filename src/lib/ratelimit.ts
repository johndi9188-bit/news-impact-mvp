import type { NextRequest } from "next/server";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function getClientIp(req: NextRequest | Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    return xff.split(",")[0]?.trim() || "unknown";
  }
  return req.headers.get("x-real-ip") || "unknown";
}

/**
 * Fixed-window rate limit. Returns true if the request is allowed.
 */
export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  return bucket.count <= max;
}
