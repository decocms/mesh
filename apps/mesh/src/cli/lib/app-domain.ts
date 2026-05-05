import { createHash } from "node:crypto";

/**
 * Stable app hash for tunnel subdomains. Returns the first 8 hex
 * characters of sha1(`${principal}-${app}`).
 *
 * `principal` is the per-user identifier from the OAuth session
 * (typically the OIDC `sub` claim); `app` is the local project name.
 * Same inputs always produce the same subdomain so tunnel registrations
 * are stable across reconnects.
 *
 * The algorithm is preserved exactly from the legacy `getAppUUID`
 * (which was misleadingly named `md5Hash` but used sha1) so the
 * subdomain shape stays consistent. The hyphen separator means inputs
 * like ("a-b", "c") and ("a", "b-c") collide — keep the separator
 * unchanged so existing registrations remain valid.
 */
export function computeAppHash(principal: string, app: string): string {
  return createHash("sha1")
    .update(`${principal}-${app}`)
    .digest("hex")
    .slice(0, 8);
}

export function computeAppDomain(principal: string, app: string): string {
  return `localhost-${computeAppHash(principal, app)}.deco.host`;
}
