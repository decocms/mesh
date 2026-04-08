/**
 * URL validation utilities to prevent SSRF attacks.
 *
 * Blocks outbound requests to private/internal network ranges
 * from endpoints that accept user-controlled URLs.
 */

/**
 * IPv4 private and reserved CIDR ranges that should not be
 * reachable from server-side fetches triggered by user input.
 */
const BLOCKED_IPV4_RANGES: Array<{ network: number; mask: number }> = [
  // 127.0.0.0/8 — loopback
  { network: 0x7f000000 >>> 0, mask: 0xff000000 >>> 0 },
  // 10.0.0.0/8 — private
  { network: 0x0a000000 >>> 0, mask: 0xff000000 >>> 0 },
  // 172.16.0.0/12 — private
  { network: 0xac100000 >>> 0, mask: 0xfff00000 >>> 0 },
  // 192.168.0.0/16 — private
  { network: 0xc0a80000 >>> 0, mask: 0xffff0000 >>> 0 },
  // 169.254.0.0/16 — link-local (AWS IMDS, etc.)
  { network: 0xa9fe0000 >>> 0, mask: 0xffff0000 >>> 0 },
  // 0.0.0.0/8 — "this" network
  { network: 0x00000000 >>> 0, mask: 0xff000000 >>> 0 },
];

/**
 * Hostnames that always resolve to loopback/internal addresses.
 */
const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost."]);

function parseIPv4(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const num = Number(part);
    if (!Number.isInteger(num) || num < 0 || num > 255) return null;
    result = (result << 8) | num;
  }
  return result >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  const addr = parseIPv4(ip);
  if (addr === null) return false;
  return BLOCKED_IPV4_RANGES.some(
    ({ network, mask }) => (addr & mask) >>> 0 === network,
  );
}

/**
 * Parse an IPv4-mapped IPv6 address in either dotted or hex notation.
 * The URL parser normalizes `::ffff:127.0.0.1` to `::ffff:7f00:1`,
 * so we need to handle both forms.
 */
function extractIPv4FromMappedIPv6(ip: string): string | null {
  const normalized = ip.toLowerCase();

  // Dotted form: ::ffff:127.0.0.1
  const dotted = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted?.[1]) return dotted[1];

  // Hex form: ::ffff:7f00:1 (URL parser normalizes to this)
  const hex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex?.[1] && hex[2]) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }

  return null;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  // ::1 — loopback
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;
  // fc00::/7 — unique local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  // fe80::/10 — link-local
  if (normalized.startsWith("fe80")) return true;
  // ::ffff:x.x.x.x — IPv4-mapped IPv6 (dotted or hex form)
  const v4 = extractIPv4FromMappedIPv6(normalized);
  if (v4) return isPrivateIPv4(v4);
  return false;
}

/**
 * Check whether a URL targets a private or internal network address.
 *
 * This performs a **syntactic** check on the hostname — it does NOT
 * do DNS resolution, so it cannot catch DNS-rebinding attacks. For
 * that, a resolving proxy or connect-time check would be needed.
 *
 * Returns `true` if the URL should be blocked.
 */
export function isPrivateNetworkUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }

  const hostname = parsed.hostname;

  // Strip brackets from IPv6
  const bare = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;

  if (BLOCKED_HOSTNAMES.has(bare.toLowerCase())) return true;
  if (isPrivateIPv4(bare)) return true;
  if (isPrivateIPv6(bare)) return true;

  return false;
}
