import { FAST_PROBE_LIMIT, FAST_PROBE_MS, SLOW_PROBE_MS } from "./constants";
import type { DiscoveredPort } from "./process/port-discovery";

export interface ProbePort {
  port: number;
  ready: boolean;
  isHtml: boolean;
  /** Score from `score(root, viteClient)`. Higher = better preview match. */
  score: number;
  /** Tracked process name (e.g. `"dev"`) when port is owned by a known root. */
  commandName: string | null;
}

export interface ProbeState {
  /** Active port answered with 2xx-3xx (i.e. the iframe will render meaningful content). */
  ready: boolean;
  /** Active port answered any HTTP status (including 4xx/5xx). Use to dismiss boot overlays. */
  responded: boolean;
  htmlSupport: boolean;
  /** The currently-active dev port: pinned `devPort` if set & responding,
   * otherwise the highest-scored discovered descendant port. */
  port: number | null;
  /** Every descendant-discovered port plus (when pinned) the pinned port,
   * each with an HTTP HEAD result. The UI uses this to show "switch to
   * port N" affordances. */
  ports: ProbePort[];
}

export interface ProbeDeps {
  upstreamHost: string;
  /**
   * Ports owned by descendants of the daemon's managed processes, with the
   * root pid each socket traces back to. Used to attribute ports to a named
   * command via `getCommandName`. `ready` is still gated on at least one HEAD
   * response — a process that's bound the port but isn't accepting yet
   * (early bind during framework bootstrap, lazy compile that times out the
   * HEAD) shouldn't read as ready.
   */
  getDiscoveredPorts: () => DiscoveredPort[];
  /**
   * Pinned port from tenant config. When non-null, this port is the ONLY
   * thing surfaced as the active `port` (gated on a HEAD response). The
   * discovered list still appears in `ports` — the pin overrides selection,
   * not visibility. Null = auto-pick the highest-scored descendant.
   */
  getPinnedPort: () => number | null;
  /** Map a root pid back to the tracked process name, or null if unknown. */
  getCommandName: (rootPid: number) => string | null;
  onChange: (state: ProbeState) => void;
  /** Called with human-readable log messages (port discovery, ready state). */
  onLog?: (msg: string) => void;
}

export interface ProbeResult {
  port: number;
  /** Got any HTTP response (including 4xx/5xx). */
  responded: boolean;
  /** Got a 2xx-3xx response. */
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

/**
 * Pure selection over already-probed results. Picks the active port and
 * derives the three signals (`ready`, `responded`, `htmlSupport`) from
 * the same per-port result, eliminating per-branch divergence.
 */
export function selectActive(
  probedAll: ProbeResult[],
  pinned: number | null,
): {
  port: number | null;
  ready: boolean;
  responded: boolean;
  htmlSupport: boolean;
} {
  if (pinned !== null) {
    const pinnedResult = probedAll.find((r) => r.port === pinned);
    if (pinnedResult && pinnedResult.responded) {
      return {
        port: pinnedResult.port,
        ready: pinnedResult.ready,
        responded: pinnedResult.responded,
        htmlSupport: pinnedResult.htmlSupport,
      };
    }
    // Pin is stale — fall back to highest-scored other responded port.
    const others = probedAll.filter((r) => r.responded && r.port !== pinned);
    const best = others.sort((a, b) => b.score - a.score)[0];
    if (best) {
      return {
        port: best.port,
        ready: best.ready,
        responded: best.responded,
        htmlSupport: best.htmlSupport,
      };
    }
    return { port: null, ready: false, responded: false, htmlSupport: false };
  }

  if (probedAll.length === 0) {
    return { port: null, ready: false, responded: false, htmlSupport: false };
  }

  const responded = probedAll.filter((r) => r.responded);
  const best = responded.sort((a, b) => b.score - a.score)[0] ?? probedAll[0];
  return {
    port: best.port,
    ready: best.ready,
    responded: best.responded,
    htmlSupport: best.htmlSupport,
  };
}

/** Kicks off the probe loop; returns the current state (live-updated). */
export function startUpstreamProbe(deps: ProbeDeps): ProbeState {
  const state: ProbeState = {
    ready: false,
    responded: false,
    htmlSupport: false,
    port: null,
    ports: [],
  };
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
    const prevResponded = state.responded;
    const prevPortsKey = portsKey(state.ports);

    const discovered = deps.getDiscoveredPorts();
    const pinned = deps.getPinnedPort();

    // Probe every descendant we found, plus the pin (when set and not already
    // a descendant). The pin probe lets users target a server they started
    // outside the daemon's tracked process tree, and lets PUT /config retarget
    // the proxy without restarting anything.
    const targets = new Map<number, number | null>(); // port → rootPid
    for (const d of discovered) targets.set(d.port, d.rootPid);
    if (pinned !== null && !targets.has(pinned)) targets.set(pinned, null);

    const probedAll: Array<ProbeResult & { rootPid: number | null }> =
      await Promise.all(
        Array.from(targets.entries()).map(async ([port, rootPid]) => ({
          ...(await probeOne(port)),
          rootPid,
        })),
      );

    state.ports = probedAll.map((r) => ({
      port: r.port,
      ready: r.ready,
      isHtml: r.htmlSupport,
      score: r.score,
      commandName: r.rootPid !== null ? deps.getCommandName(r.rootPid) : null,
    }));

    const active = selectActive(probedAll, pinned);
    state.port = active.port;
    state.ready = active.ready;
    state.responded = active.responded;
    state.htmlSupport = active.htmlSupport;

    const newPortsKey = portsKey(state.ports);
    const portsChanged = prevPortsKey !== newPortsKey;
    const readyChanged = prevReady !== state.ready;
    const portChanged = prevPort !== state.port;

    if (portsChanged && state.ports.length > 0) {
      const portList = state.ports
        .map((p) => `${p.port}${p.ready ? " (ready)" : ""}`)
        .join(", ");
      deps.onLog?.(`[probe] discovered port(s): ${portList}\r\n`);
    }
    if (readyChanged) {
      if (state.ready) {
        deps.onLog?.(`[probe] server ready on port ${state.port}\r\n`);
      } else if (prevReady) {
        deps.onLog?.(`[probe] server no longer ready\r\n`);
      }
    } else if (portChanged && state.port !== null) {
      deps.onLog?.(`[probe] active port changed to ${state.port}\r\n`);
    }

    if (
      readyChanged ||
      portChanged ||
      prevHtml !== state.htmlSupport ||
      prevResponded !== state.responded ||
      portsChanged
    ) {
      deps.onChange({
        ready: state.ready,
        responded: state.responded,
        htmlSupport: state.htmlSupport,
        port: state.port,
        ports: state.ports.slice(),
      });
    }
    count++;
    setTimeout(tick, count < FAST_PROBE_LIMIT ? FAST_PROBE_MS : SLOW_PROBE_MS);
  };

  function portsKey(ports: ProbePort[]): string {
    // Order-independent dedupe key: changes when any port enters/leaves or
    // flips ready/isHtml. Used to drive SSE `status` updates so the UI can
    // refresh the port list without polling.
    return [...ports]
      .sort((a, b) => a.port - b.port)
      .map((p) => `${p.port}:${p.ready ? 1 : 0}:${p.isHtml ? 1 : 0}`)
      .join(",");
  }

  setTimeout(tick, 1000);
  return state;
}
