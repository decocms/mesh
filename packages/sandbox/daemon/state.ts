import type { BootConfig, Config, TenantConfig } from "./types";

export type Phase = "pending-bootstrap" | "bootstrapping" | "ready";

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
  bootConfig: BootConfig | null;
  tenantConfig: TenantConfig | null;
  bootstrapHash: string | null;
  lastError: string | null;
  configReady: Promise<Config>;
  resolveConfig: (c: Config) => void;
}

let resolveConfig!: (c: Config) => void;
const configReady = new Promise<Config>((resolve) => {
  resolveConfig = resolve;
});
const state: State = {
  phase: "pending-bootstrap",
  bootConfig: null,
  tenantConfig: null,
  bootstrapHash: null,
  lastError: null,
  configReady,
  resolveConfig,
};

export function getPhase(): Phase {
  return state.phase;
}

export function setPhase(p: Phase): void {
  state.phase = p;
}

export function getBootstrapHash(): string | null {
  return state.bootstrapHash;
}

export function setBootstrapHash(h: string | null): void {
  state.bootstrapHash = h;
}

export function getLastError(): string | null {
  return state.lastError;
}

export function setLastError(msg: string | null): void {
  state.lastError = msg;
}

export function setBootConfig(c: BootConfig): void {
  state.bootConfig = c;
  if (state.tenantConfig) {
    state.resolveConfig({ ...c, ...state.tenantConfig });
  }
}

export function getBootConfig(): BootConfig {
  if (!state.bootConfig) {
    throw new Error("bootConfig not initialized");
  }
  return state.bootConfig;
}

export function peekBootConfig(): BootConfig | null {
  return state.bootConfig;
}

export function setTenantConfig(t: TenantConfig): void {
  const wasNull = state.tenantConfig === null;
  state.tenantConfig = t;
  if (wasNull && state.bootConfig) {
    state.resolveConfig({ ...state.bootConfig, ...t });
  }
}

export function clearTenantConfig(): void {
  state.tenantConfig = null;
}

export function peekTenantConfig(): TenantConfig | null {
  return state.tenantConfig;
}

export function peekConfig(): Config | null {
  if (!state.bootConfig || !state.tenantConfig) return null;
  return { ...state.bootConfig, ...state.tenantConfig };
}

export function getConfig(): Promise<Config> {
  return state.configReady;
}
