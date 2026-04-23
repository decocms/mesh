import { timingSafeEqual } from "node:crypto";
import { TOKEN } from "./config.mjs";

const EXPECTED = Buffer.from(`Bearer ${TOKEN}`, "utf8");

/**
 * Bearer-token check. Health is exempt upstream; every other route goes
 * through this. Uses `timingSafeEqual` so an attacker who can reach the
 * daemon port directly (e.g. via the local `*.sandboxes.localhost` ingress
 * forwarder) can't recover the token byte-by-byte from response latency.
 *
 * `timingSafeEqual` requires equal-length buffers, so we length-check first
 * and return false without comparing when they differ. That length itself
 * leaks no useful bits — the expected length is constant for a running
 * daemon, and the caller already knows the Bearer scheme.
 */
export function authorized(req) {
  const header = req.headers["authorization"] ?? "";
  const received = Buffer.from(header, "utf8");
  if (received.length !== EXPECTED.length) return false;
  return timingSafeEqual(received, EXPECTED);
}
