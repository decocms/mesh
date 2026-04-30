import type { Config } from "./types";

export type Phase = "pending-bootstrap" | "bootstrapping" | "ready" | "failed";

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
  bootstrapHash: string | null;
  config: Config | null;
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

export function setPhase(p: Phase): void {
  state.phase = p;
}

export function setBootstrapHash(h: string | null): void {
  state.bootstrapHash = h;
}

export function setConfig(c: Config): void {
  const wasNull = state.config === null;
  state.config = c;
  if (wasNull) state.resolveConfig(c);
}

export function peekConfig(): Config | null {
  return state.config;
}

export function getConfig(): Promise<Config> {
  return state.configReady;
}
