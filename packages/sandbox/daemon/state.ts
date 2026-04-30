import type { Config } from "./types";

export type Phase = "pending-bootstrap" | "bootstrapping" | "ready" | "failed";

/**
 * Process-wide async mutex covering every observation/transition of phase
 * and every read/write of bootstrap.json. Tiny FIFO queue — no fairness
 * guarantee beyond JS's microtask ordering, which is enough here.
 */
class Mutex {
  private chain: Promise<void> = Promise.resolve();

  async acquire(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prev = this.chain;
    this.chain = prev.then(() => next);
    await prev;
    return release;
  }

  async run<T>(fn: () => Promise<T> | T): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export const bootstrapMutex = new Mutex();

interface State {
  phase: Phase;
  /** sha256(canonicalize(payload)) once persisted; null in pending-bootstrap. */
  bootstrapHash: string | null;
  config: Config | null;
  /** Resolved on first setConfig() call. Lets module-init sites await config. */
  configReady: Promise<Config>;
  resolveConfig: (c: Config) => void;
}

let resolveConfig!: (c: Config) => void;
const configReady = new Promise<Config>((resolve) => {
  resolveConfig = resolve;
});
const state: State = {
  phase: "pending-bootstrap",
  bootstrapHash: null,
  config: null,
  configReady,
  resolveConfig,
};

export function getPhase(): Phase {
  return state.phase;
}

export function getBootstrapHash(): string | null {
  return state.bootstrapHash;
}

/** Caller must hold bootstrapMutex. */
export function setPhase(p: Phase): void {
  state.phase = p;
}

/** Caller must hold bootstrapMutex. */
export function setBootstrapHash(h: string | null): void {
  state.bootstrapHash = h;
}

/** Caller must hold bootstrapMutex. */
export function setConfig(c: Config): void {
  const wasNull = state.config === null;
  state.config = c;
  if (wasNull) state.resolveConfig(c);
}

/** Synchronous accessor — null until setConfig has fired. */
export function peekConfig(): Config | null {
  return state.config;
}

/** Resolves once setConfig has fired (post-bootstrap or post-hydration). */
export function getConfig(): Promise<Config> {
  return state.configReady;
}
