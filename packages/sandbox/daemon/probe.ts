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
   * Candidate ports to score each tick. All are probed in parallel; the
   * one with the highest "looks like the dev preview" score wins. Empty
   * array → state stays { ready:false, port:null }.
   */
  getCandidatePorts: () => number[];
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

  const head = async (url: string): Promise<HeadResult | null> => {
    try {
      const res = await fetch(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
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

  const tryOne = async (port: number): Promise<ProbeResult> => {
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
    const candidates = deps.getCandidatePorts();
    const results = await Promise.all(candidates.map(tryOne));
    // Highest score wins; on tie, the candidate-list order (already
    // discovered-first) breaks it — `Array.sort` is stable in modern JS.
    const best = results
      .filter((r) => r.responded)
      .sort((a, b) => b.score - a.score)[0];
    if (best) {
      state.port = best.port;
      state.ready = best.ready;
      state.htmlSupport = best.htmlSupport;
    } else {
      state.port = null;
      state.ready = false;
      state.htmlSupport = false;
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
