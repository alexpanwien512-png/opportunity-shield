// Anonymous visitor identity + a small in-memory rate limiter for the public demo.
import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";

const COOKIE = "os_sid";

/** Each browser gets its own memory (profile, history, blacklist, rules) via an anonymous cookie. */
export async function ownerId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing && /^[a-f0-9-]{36}$/.test(existing)) return existing;
  const id = randomUUID();
  jar.set(COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
  return id;
}

export class RateLimited extends Error {
  constructor(readonly retryAfterS: number) {
    super(`Demo limit reached — try again in ${Math.ceil(retryAfterS / 60)} min, or run it locally with your own keys.`);
  }
}

const buckets = new Map<string, number[]>();

/**
 * Sliding-window limit on live (uncached) runs, keyed by client IP. Configure with
 * RATE_LIMIT_ANALYZE / RATE_LIMIT_SCAN ("count/minutes", e.g. "12/60"); unset = no limit.
 * Throws RateLimited when over the limit.
 */
export async function takeToken(kind: "analyze" | "scan"): Promise<void> {
  const spec = process.env[kind === "analyze" ? "RATE_LIMIT_ANALYZE" : "RATE_LIMIT_SCAN"];
  if (!spec) return;
  const [count, minutes] = spec.split("/").map(Number);
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
  const key = `${kind}:${ip}`;
  const now = Date.now();
  const windowMs = minutes * 60_000;
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= count) {
    buckets.set(key, hits);
    throw new RateLimited((hits[0] + windowMs - now) / 1000);
  }
  hits.push(now);
  buckets.set(key, hits);
}
