/**
 * Loopback fetch helper. Inside the sandbox both the daemon and the dev
 * server live on the same machine, but the dev server may bind IPv4 only
 * (127.0.0.1, classic Node default) or IPv6 only ([::1], what
 * `Bun.serve`/Vite-on-Bun pick on a dual-stack system). Bun's fetch
 * resolves `localhost` to a single address — the wrong one half the time
 * — so we try [::1] first and fall back to 127.0.0.1.
 *
 * Sequential, not parallel. ECONNREFUSED returns instantly, so the
 * fallback path adds ~1ms in the IPv4-only case and zero in the IPv6
 * case.
 */
export async function fetchLoopback(
  port: number,
  pathAndQuery: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(`http://[::1]:${port}${pathAndQuery}`, init);
  } catch {
    return await fetch(`http://127.0.0.1:${port}${pathAndQuery}`, init);
  }
}
