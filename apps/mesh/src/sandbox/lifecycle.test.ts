import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { DockerSandboxRunner } from "mesh-plugin-user-sandbox/runner";
import type { MeshContext } from "@/core/mesh-context";
import { asDockerRunner, getRunnerByKind } from "./lifecycle";

// Minimal MeshContext stub — lifecycle only reads ctx.db, and only to hand
// it to the KyselySandboxRunnerStateStore constructor (no queries run until
// an actual ensure/delete call).
const stubCtx = { db: {} } as unknown as MeshContext;

describe("asDockerRunner", () => {
  it("returns null for null input", () => {
    expect(asDockerRunner(null)).toBeNull();
  });

  it("returns the instance unchanged for a DockerSandboxRunner", () => {
    const runner = new DockerSandboxRunner();
    expect(asDockerRunner(runner)).toBe(runner);
  });

  it("returns null for a non-Docker runner", () => {
    // Duck-typed non-Docker runner — satisfies the SandboxRunner shape but
    // isn't a DockerSandboxRunner instance, so instanceof narrows to null.
    const fake = {
      kind: "freestyle" as const,
      ensure: async () => ({ handle: "h", workdir: "/app", previewUrl: null }),
      exec: async () => ({
        stdout: "",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      }),
      delete: async () => {},
      alive: async () => false,
      getPreviewUrl: async () => null,
      proxyDaemonRequest: async () => new Response(null, { status: 204 }),
    };
    // biome-ignore lint/suspicious/noExplicitAny: intentional duck-type
    expect(asDockerRunner(fake as any)).toBeNull();
  });
});

describe("getRunnerByKind caching", () => {
  // The `runners` cache lives at module scope, so a kind cached by one test
  // leaks into later tests. Isolate by claiming a kind once per suite and
  // asserting identity within the same test only.

  beforeEach(() => {
    // No-op: we can't reset module state without dynamic re-import, so each
    // test must use independent observations (see below).
  });

  afterEach(() => {});

  it("returns the same DockerSandboxRunner instance across calls", async () => {
    const a = await getRunnerByKind(stubCtx, "docker");
    const b = await getRunnerByKind(stubCtx, "docker");
    expect(a).toBe(b);
    expect(a).toBeInstanceOf(DockerSandboxRunner);
  });
});
