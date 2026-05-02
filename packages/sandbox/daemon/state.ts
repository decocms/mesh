import type { BootConfig, Config, TenantConfig } from "./types";
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
  bootConfig: BootConfig | null;
  tenantConfig: TenantConfig | null;
  configReady: Promise<Config>;
  resolveConfig: (c: Config) => void;
}

let resolveConfig!: (c: Config) => void;
const configReady = new Promise<Config>((resolve) => {
  resolveConfig = resolve;
});
const state: State = {
  bootConfig: null,
  tenantConfig: null,
  configReady,
  resolveConfig,
};

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
