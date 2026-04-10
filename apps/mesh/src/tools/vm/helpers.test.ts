import { describe, it, expect } from "bun:test";
import { resolveRuntimeConfig } from "./helpers";
import type { VmMetadata } from "./types";

// ---------------------------------------------------------------------------
// Tests for resolveRuntimeConfig (pure function — no MeshContext needed)
// ---------------------------------------------------------------------------

describe("resolveRuntimeConfig", () => {
  it("returns npm defaults when no runtime config is set", () => {
    const metadata: VmMetadata = {};

    const result = resolveRuntimeConfig(metadata);

    expect(result.installScript).toBe("npm install");
    expect(result.devScript).toBe("npm run dev");
    expect(result.detected).toBe("npm");
    expect(result.port).toBe("3000");
    expect(result.needsRuntimeInstall).toBe(false);
  });

  it("returns npm defaults when runtime is null", () => {
    const metadata: VmMetadata = { runtime: null };

    const result = resolveRuntimeConfig(metadata);

    expect(result.installScript).toBe("npm install");
    expect(result.devScript).toBe("npm run dev");
    expect(result.detected).toBe("npm");
    expect(result.port).toBe("3000");
    expect(result.needsRuntimeInstall).toBe(false);
  });

  it("detects deno and sets needsRuntimeInstall to true", () => {
    const metadata: VmMetadata = {
      runtime: {
        detected: "deno",
        selected: "deno",
        installScript: "deno install",
        devScript: "deno task dev",
        port: "8000",
      },
    };

    const result = resolveRuntimeConfig(metadata);

    expect(result.detected).toBe("deno");
    expect(result.needsRuntimeInstall).toBe(true);
  });

  it("detects bun and sets needsRuntimeInstall to true", () => {
    const metadata: VmMetadata = {
      runtime: {
        detected: "bun",
        selected: "bun",
        installScript: "bun install",
        devScript: "bun run dev",
        port: "3000",
      },
    };

    const result = resolveRuntimeConfig(metadata);

    expect(result.detected).toBe("bun");
    expect(result.needsRuntimeInstall).toBe(true);
  });

  it("npm does NOT need runtime install", () => {
    const metadata: VmMetadata = {
      runtime: {
        detected: "npm",
        selected: "npm",
        installScript: "npm install",
        devScript: "npm run dev",
        port: "3000",
      },
    };

    const result = resolveRuntimeConfig(metadata);

    expect(result.detected).toBe("npm");
    expect(result.needsRuntimeInstall).toBe(false);
  });

  it("uses custom scripts from metadata", () => {
    const metadata: VmMetadata = {
      runtime: {
        detected: "npm",
        selected: "npm",
        installScript: "pnpm install",
        devScript: "pnpm dev",
        port: "4200",
      },
    };

    const result = resolveRuntimeConfig(metadata);

    expect(result.installScript).toBe("pnpm install");
    expect(result.devScript).toBe("pnpm dev");
    expect(result.port).toBe("4200");
    expect(result.needsRuntimeInstall).toBe(false);
  });

  it("falls back to defaults when individual runtime fields are null", () => {
    const metadata: VmMetadata = {
      runtime: {
        detected: null,
        selected: null,
        installScript: null,
        devScript: null,
        port: null,
      },
    };

    const result = resolveRuntimeConfig(metadata);

    expect(result.installScript).toBe("npm install");
    expect(result.devScript).toBe("npm run dev");
    expect(result.detected).toBe("npm");
    expect(result.port).toBe("3000");
    expect(result.needsRuntimeInstall).toBe(false);
  });
});
