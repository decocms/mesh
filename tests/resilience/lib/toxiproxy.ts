const TOXIPROXY_URL = "http://127.0.0.1:18474";

export interface ToxicConfig {
  type: string;
  attributes: Record<string, number>;
  name: string;
}

export interface ProxyConfig {
  name: string;
  listen: string;
  upstream: string;
  enabled?: boolean;
}

async function assertOk(response: Response, context: string): Promise<void> {
  if (!response.ok) {
    const body = await response.text().catch(() => "<unreadable body>");
    throw new Error(
      `${context}: HTTP ${response.status} ${response.statusText} — ${body}`,
    );
  }
}

/**
 * Create or replace a set of proxies in one call.
 * POST /populate with an array of proxy configs.
 */
export async function populateProxies(proxies: ProxyConfig[]): Promise<void> {
  const res = await fetch(`${TOXIPROXY_URL}/populate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(proxies),
  });
  await assertOk(res, "populateProxies");
}

/**
 * Add a toxic to a proxy.
 * POST /proxies/{proxyName}/toxics
 */
export async function addToxic(
  proxyName: string,
  toxic: ToxicConfig,
): Promise<void> {
  const res = await fetch(`${TOXIPROXY_URL}/proxies/${proxyName}/toxics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: toxic.name,
      type: toxic.type,
      attributes: toxic.attributes,
      stream: "downstream",
    }),
  });
  await assertOk(res, `addToxic(${proxyName}, ${toxic.name})`);
}

/**
 * Remove a toxic from a proxy by name.
 * DELETE /proxies/{proxyName}/toxics/{toxicName}
 */
export async function removeToxic(
  proxyName: string,
  toxicName: string,
): Promise<void> {
  const res = await fetch(
    `${TOXIPROXY_URL}/proxies/${proxyName}/toxics/${toxicName}`,
    { method: "DELETE" },
  );
  await assertOk(res, `removeToxic(${proxyName}, ${toxicName})`);
}

/**
 * Disable a proxy (severs all connections immediately).
 * PATCH /proxies/{proxyName} { enabled: false }
 */
export async function disableProxy(proxyName: string): Promise<void> {
  const res = await fetch(`${TOXIPROXY_URL}/proxies/${proxyName}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: false }),
  });
  await assertOk(res, `disableProxy(${proxyName})`);
}

/**
 * Re-enable a previously disabled proxy.
 * PATCH /proxies/{proxyName} { enabled: true }
 */
export async function enableProxy(proxyName: string): Promise<void> {
  const res = await fetch(`${TOXIPROXY_URL}/proxies/${proxyName}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });
  await assertOk(res, `enableProxy(${proxyName})`);
}

/**
 * Reset all proxies: remove every toxic and re-enable every proxy.
 * POST /reset
 */
export async function resetAll(): Promise<void> {
  const res = await fetch(`${TOXIPROXY_URL}/reset`, { method: "POST" });
  await assertOk(res, "resetAll");
}
