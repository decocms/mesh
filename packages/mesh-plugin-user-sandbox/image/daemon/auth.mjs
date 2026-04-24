import { timingSafeEqual } from "node:crypto";
import { TOKEN } from "./config.mjs";

const EXPECTED = Buffer.from(`Bearer ${TOKEN}`, "utf8");

/**
 * `timingSafeEqual` defeats byte-by-byte latency recovery. It requires
 * equal-length buffers, so we length-check first; the length itself leaks
 * no useful bits (expected length is constant, scheme is public).
 */
export function authorized(req) {
  const header = req.headers["authorization"] ?? "";
  const received = Buffer.from(header, "utf8");
  if (received.length !== EXPECTED.length) return false;
  return timingSafeEqual(received, EXPECTED);
}
