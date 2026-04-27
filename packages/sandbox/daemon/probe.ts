import { FAST_PROBE_LIMIT, FAST_PROBE_MS, SLOW_PROBE_MS } from "./constants";

export interface ProbeState {
  ready: boolean;
  htmlSupport: boolean;
}

export interface ProbeDeps {
  upstreamHost: string;
  upstreamPort: number;
  onChange: (state: ProbeState) => void;
}

/** Kicks off the probe loop; returns the current state (live-updated). */
export function startUpstreamProbe(deps: ProbeDeps): ProbeState {
  const state: ProbeState = { ready: false, htmlSupport: false };
  let count = 0;

  const tick = async () => {
    const prev = state.ready;
    try {
      const res = await fetch(
        `http://${deps.upstreamHost}:${deps.upstreamPort}/`,
        { method: "HEAD", signal: AbortSignal.timeout(5000) },
      );
      const ct = (res.headers.get("content-type") ?? "").toLowerCase();
      state.ready = res.status >= 200 && res.status < 400;
      state.htmlSupport = ct.includes("text/html");
    } catch {
      state.ready = false;
      state.htmlSupport = false;
    }
    if (state.ready !== prev) deps.onChange({ ...state });
    count++;
    setTimeout(tick, count < FAST_PROBE_LIMIT ? FAST_PROBE_MS : SLOW_PROBE_MS);
  };

  setTimeout(tick, 1000);
  return state;
}
