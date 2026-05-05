import { describe, expect, it } from "bun:test";
import type { TenantConfig } from "../types";
import { deepMerge } from "./merge";

describe("deepMerge", () => {
  it("returns patch when current is null", () => {
    const patch: Partial<TenantConfig> = {
      application: {
        packageManager: { name: "npm" },
        runtime: "node",
        intent: "paused",
        proxy: {},
      },
    };
    const merged = deepMerge(null, patch);
    expect(merged.application?.packageManager?.name).toBe("npm");
  });

  it("preserves fields not in patch", () => {
    const current: TenantConfig = {
      git: { repository: { cloneUrl: "x", branch: "main" } },
      application: {
        packageManager: { name: "npm" },
        runtime: "node",
        intent: "paused",
        proxy: {},
      },
    };
    const patch: Partial<TenantConfig> = {
      application: {
        packageManager: { name: "pnpm" },
        runtime: "node",
        intent: "paused",
        proxy: {},
      },
    };
    const merged = deepMerge(current, patch);
    expect(merged.git?.repository?.cloneUrl).toBe("x");
    expect(merged.application?.packageManager?.name).toBe("pnpm");
  });

  it("deep-merges nested objects (proxy.targetPort)", () => {
    const current: TenantConfig = {
      application: {
        packageManager: { name: "npm" },
        runtime: "node",
        intent: "paused",
        proxy: {},
      },
    };
    const patch: Partial<TenantConfig> = {
      application: {
        packageManager: { name: "npm" },
        runtime: "node",
        intent: "paused",
        proxy: { targetPort: 5173 },
      },
    };
    const merged = deepMerge(current, patch);
    expect(merged.application?.proxy?.targetPort).toBe(5173);
  });

  it("absent fields don't overwrite existing ones", () => {
    const current: TenantConfig = {
      application: {
        packageManager: { name: "npm" },
        runtime: "node",
        intent: "running",
        desiredPort: 3000,
        proxy: { targetPort: 4000 },
      },
    };
    const patch: Partial<TenantConfig> = {
      application: {
        packageManager: { name: "pnpm" },
        runtime: "node",
        intent: "running",
        proxy: {},
      },
    };
    const merged = deepMerge(current, patch);
    // Outer fields stay as original
    expect(merged.application?.desiredPort).toBe(3000);
    expect(merged.application?.proxy?.targetPort).toBe(4000);
    // Patch wins on what it does specify
    expect(merged.application?.packageManager?.name).toBe("pnpm");
  });
});
