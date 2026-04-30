import { FAST_PROBE_LIMIT, FAST_PROBE_MS, SLOW_PROBE_MS } from "./constants";

export interface ProbeState {
  ready: boolean;
  htmlSupport: boolean;
  /** The port that last responded to HEAD `/`, or null if none yet. */
  port: number | null;
}

export interface ProbeDeps {
  upstreamHost: string;
  /**
   * Ports owned by descendants of the daemon's managed dev process, per
   * /proc inspection. The discovery list picks the candidate port (so the
   * preview reverse-proxy lands on the right socket), but `ready` is still
   * gated on at least one HEAD response — a process that's bound the port
   * but isn't accepting yet (early bind during framework bootstrap, lazy
   * compile that times out the HEAD) shouldn't read as ready.
   */
  getDiscoveredPorts: () => number[];
  /**
   * Env-hint fallback (DEV_PORT). Used only when no descendant ports
   * have been discovered yet — typically the brief window between
   * daemon boot and the dev process binding, or in tests where there's
   * no managed dev process at all. Treated as untrusted: gated on a
   * successful HEAD probe.
   */
  getFallbackPort: () => number;
  onChange: (state: ProbeState) => void;
}

interface ProbeResult {
  port: number;
  responded: boolean;
  ready: boolean;
  htmlSupport: boolean;
  /** Higher = more likely to be the actual dev preview surface. */
  score: number;
}

interface HeadResult {
  ok: boolean;
  status: number;
  isHtml: boolean;
}

/**
 * Score a port. The `/@vite/client` probe disambiguates Vite from any
 * other listener that happens to also serve HTML at `/`: Vite returns
 * JS, anything else returns HTML or 404. Sidecar runtimes (workerd,
 * esbuild) are filtered upstream by port-discovery.ts — we don't probe
 * them from here.
 */
function score(root: HeadResult | null, viteClient: HeadResult | null): number {
  let s = 0;
  if (root) {
    if (root.ok) s += root.isHtml ? 100 : 50;
    else s += 10; // HTTP, but not 2xx-3xx
  }
  if (viteClient && viteClient.ok && !viteClient.isHtml) s += 50;
  return s;
}

/** Kicks off the probe loop; returns the current state (live-updated). */
export function startUpstreamProbe(deps: ProbeDeps): ProbeState {
  const state: ProbeState = { ready: false, htmlSupport: false, port: null };
  let count = 0;

  // First-request compile in Next/Vite/etc. can run 8–20s on big apps; the
  // probe blocks on it because HEAD `/` triggers the same lazy-compile path
  // as GET. A short timeout here false-negatives the htmlSupport check for
  // the entire compile window. 30s comfortably absorbs typical first-compiles
  // without reacting to dead-server ECONNREFUSED any slower (that fails fast).
  const HEAD_TIMEOUT_MS = 30_000;
  const head = async (url: string): Promise<HeadResult | null> => {
    try {
      const res = await fetch(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(HEAD_TIMEOUT_MS),
      });
      const ct = (res.headers.get("content-type") ?? "").toLowerCase();
      return {
        ok: res.status >= 200 && res.status < 400,
        status: res.status,
        isHtml: ct.includes("text/html"),
      };
    } catch {
      return null;
    }
  };

  const probeOne = async (port: number): Promise<ProbeResult> => {
    const base = `http://${deps.upstreamHost}:${port}`;
    // Probe `/` first; only ask `/@vite/client` if root looks like a real
    // HTML responder. Avoids hammering ports that don't speak HTTP.
    const root = await head(`${base}/`);
    let viteClient: HeadResult | null = null;
    if (root && root.ok && root.isHtml) {
      viteClient = await head(`${base}/@vite/client`);
    }
    return {
      port,
      responded: root !== null,
      ready: root?.ok ?? false,
      htmlSupport: root?.isHtml ?? false,
      score: score(root, viteClient),
    };
  };

  const tick = async () => {
    const prevReady = state.ready;
    const prevPort = state.port;
    const prevHtml = state.htmlSupport;

    const discovered = deps.getDiscoveredPorts();

    if (discovered.length > 0) {
      const results = await Promise.all(discovered.map(probeOne));
      const responded = results.filter((r) => r.responded);
      const best = responded.sort((a, b) => b.score - a.score)[0] ?? results[0];
      state.port = best.port;
      state.ready = responded.length > 0;
      state.htmlSupport = best.htmlSupport;
    } else {
      // Untrusted fallback: env-hint port only, gated on a successful HEAD.
      const result = await probeOne(deps.getFallbackPort());
      if (result.responded) {
        state.port = result.port;
        state.ready = result.ready;
        state.htmlSupport = result.htmlSupport;
      } else {
        state.port = null;
        state.ready = false;
        state.htmlSupport = false;
      }
    }

    if (
      prevReady !== state.ready ||
      prevPort !== state.port ||
      prevHtml !== state.htmlSupport
    ) {
      deps.onChange({ ...state });
    }
    count++;
    setTimeout(tick, count < FAST_PROBE_LIMIT ? FAST_PROBE_MS : SLOW_PROBE_MS);
  };

  setTimeout(tick, 1000);
  return state;
}
