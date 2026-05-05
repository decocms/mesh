import { createHash } from "node:crypto";

/**
 * Legacy-compatible app hash. Returns the first 8 hex characters of
 * sha1(`${workspace}-${app}`). Preserved exactly from packages/cli's
 * getAppUUID so existing tunnel subdomains remain valid.
 *
 * (Yes, the legacy function was named md5Hash but used sha1.)
 */
export function computeAppHash(workspace: string, app: string): string {
  return createHash("sha1")
    .update(`${workspace}-${app}`)
    .digest("hex")
    .slice(0, 8);
}

export function computeAppDomain(workspace: string, app: string): string {
  return `localhost-${computeAppHash(workspace, app)}.deco.host`;
}
