import { describe, expect, test } from "bun:test";
import {
  createConfigTools,
  fromDaemonConfig,
  GetVmConfigInputSchema,
  type SetVmConfigInput,
  SetVmConfigInputSchema,
  toDaemonPatch,
} from "./config-tools";

describe("SetVmConfigInputSchema", () => {
  test("accepts a single field", () => {
    expect(
      SetVmConfigInputSchema.safeParse({ monorepoPath: "apps/web" }).success,
    ).toBe(true);
    expect(
      SetVmConfigInputSchema.safeParse({ packageManager: "pnpm" }).success,
    ).toBe(true);
    expect(SetVmConfigInputSchema.safeParse({ intent: "paused" }).success).toBe(
      true,
    );
    expect(
      SetVmConfigInputSchema.safeParse({ previewPort: 5173 }).success,
    ).toBe(true);
  });

  test("rejects an empty patch", () => {
    expect(SetVmConfigInputSchema.safeParse({}).success).toBe(false);
  });

  test("rejects out-of-range previewPort", () => {
    expect(
      SetVmConfigInputSchema.safeParse({ previewPort: 70_000 }).success,
    ).toBe(false);
    expect(SetVmConfigInputSchema.safeParse({ previewPort: 0 }).success).toBe(
      false,
    );
  });

  test("strips unknown fields including the wire-only `auth.rotateToken`, the immutable `cloneUrl`, the read-only `branch`, and the deliberately-removed `gitIdentity`", () => {
    // Zod object schema strips unknown keys by default rather than rejecting,
    // which matches how the daemon's PUT validator handles unknown fields.
    // The critical point is that anything dangerous (`auth`, `cloneUrl`,
    // `branch`) or deliberately removed (`gitIdentity` — commits should be
    // authored by the user, not the agent) cannot reach `toDaemonPatch`.
    const result = SetVmConfigInputSchema.safeParse({
      monorepoPath: "apps/web",
      auth: { rotateToken: "x".repeat(48) },
      cloneUrl: "https://malicious.example.com/repo.git",
      branch: "feature",
      gitIdentity: { name: "Mallory", email: "mallory@example.com" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as Record<string, unknown>;
      expect(data.auth).toBeUndefined();
      expect(data.cloneUrl).toBeUndefined();
      expect(data.branch).toBeUndefined();
      expect(data.gitIdentity).toBeUndefined();
    }
  });
});

describe("toDaemonPatch", () => {
  test("translates monorepoPath into application.packageManager.path", () => {
    expect(toDaemonPatch({ monorepoPath: "apps/web" })).toEqual({
      application: { packageManager: { path: "apps/web" } },
    });
  });

  test("translates previewPort into application.desiredPort", () => {
    expect(toDaemonPatch({ previewPort: 5173 })).toEqual({
      application: { desiredPort: 5173 },
    });
  });

  test("merges packageManager and monorepoPath under one packageManager object", () => {
    expect(
      toDaemonPatch({ packageManager: "pnpm", monorepoPath: "apps/web" }),
    ).toEqual({
      application: {
        packageManager: { name: "pnpm", path: "apps/web" },
      },
    });
  });

  test("composes multiple sections without leaking empty objects", () => {
    expect(
      toDaemonPatch({
        intent: "running",
        runtime: "bun",
        packageManager: "bun",
      }),
    ).toEqual({
      application: {
        runtime: "bun",
        intent: "running",
        packageManager: { name: "bun" },
      },
    });
  });

  test("never emits `auth` or `git` fields even if smuggled in (defense in depth alongside the schema strip)", () => {
    // Cast the input to bypass the static SetVmConfigInput shape; the point
    // of the test is to assert that toDaemonPatch ignores anything outside
    // the allowed surface, even if the type system were to fail us upstream.
    const smuggled = {
      monorepoPath: "apps/web",
      auth: { rotateToken: "x".repeat(48) },
      gitIdentity: { name: "Mallory", email: "mallory@example.com" },
    } as unknown as SetVmConfigInput;
    const patch = toDaemonPatch(smuggled);
    expect((patch as Record<string, unknown>).auth).toBeUndefined();
    expect((patch as Record<string, unknown>).git).toBeUndefined();
  });
});

describe("fromDaemonConfig", () => {
  test("returns empty for null", () => {
    expect(fromDaemonConfig(null)).toEqual({});
  });

  test("maps a fully populated daemon config to user-facing shape", () => {
    expect(
      fromDaemonConfig({
        git: {
          repository: {
            cloneUrl: "https://github.com/acme/web.git",
            branch: "main",
          },
        },
        application: {
          packageManager: { name: "pnpm", path: "apps/web" },
          runtime: "node",
          intent: "running",
          desiredPort: 3000,
          proxy: { targetPort: 3000 },
        },
      }),
    ).toEqual({
      cloneUrl: "https://github.com/acme/web.git",
      branch: "main",
      packageManager: "pnpm",
      monorepoPath: "apps/web",
      runtime: "node",
      intent: "running",
      previewPort: 3000,
      proxyTargetPort: 3000,
    });
  });

  test("omits absent fields rather than emitting undefined", () => {
    const out = fromDaemonConfig({
      application: { packageManager: { name: "npm" }, runtime: "node" },
    });
    expect(out).toEqual({ packageManager: "npm", runtime: "node" });
    expect("monorepoPath" in out).toBe(false);
    expect("previewPort" in out).toBe(false);
    expect("intent" in out).toBe(false);
  });
});

describe("GetVmConfigInputSchema", () => {
  test("accepts an empty object", () => {
    expect(GetVmConfigInputSchema.safeParse({}).success).toBe(true);
  });
});

describe("createConfigTools", () => {
  // Minimal fake — tracks the wire calls without running a real daemon.
  function fakeRunner(
    handler: (
      path: string,
      init: { method: string; body: BodyInit | null },
    ) => Response,
  ) {
    const calls: Array<{
      handle: string;
      path: string;
      method: string;
      body: BodyInit | null;
    }> = [];
    const runner = {
      kind: "host" as const,
      proxyDaemonRequest: async (
        handle: string,
        path: string,
        init: { method: string; headers: Headers; body: BodyInit | null },
      ): Promise<Response> => {
        calls.push({ handle, path, method: init.method, body: init.body });
        return handler(path, init);
      },
    };
    return { runner, calls };
  }

  test("get_vm_config issues GET with no body and parses the response", async () => {
    const { runner, calls } = fakeRunner(() =>
      Response.json({
        bootId: "boot-1",
        config: {
          application: {
            packageManager: { name: "npm" },
            runtime: "node",
            intent: "paused",
          },
        },
      }),
    );
    const tools = createConfigTools({
      // biome-ignore lint/suspicious/noExplicitAny: test fake
      runner: runner as any,
      ensureHandle: async () => "handle-x",
      needsApproval: false,
    });

    const out = await tools.get_vm_config.execute!({}, {
      // biome-ignore lint/suspicious/noExplicitAny: AI SDK execute options
    } as any);
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.method).toBe("GET");
    expect(call.path).toBe("/_decopilot_vm/config");
    // GET must not carry a body — the daemon's body parser treats a non-empty
    // body on GET as a contract violation worth catching here.
    expect(call.body).toBeNull();
    expect(out).toMatchObject({
      config: { packageManager: "npm", runtime: "node", intent: "paused" },
      appStatus: "unknown",
      ready: false,
    });
  });

  test("set_vm_config issues PUT with a base64-encoded body and surfaces transition", async () => {
    const { runner, calls } = fakeRunner(() =>
      Response.json({
        bootId: "boot-1",
        transition: "pm-change",
        config: {
          application: {
            packageManager: { name: "pnpm", path: "apps/web" },
            runtime: "node",
            intent: "paused",
          },
        },
      }),
    );
    const tools = createConfigTools({
      // biome-ignore lint/suspicious/noExplicitAny: test fake
      runner: runner as any,
      ensureHandle: async () => "handle-x",
      needsApproval: true,
    });

    const out = await tools.set_vm_config.execute!(
      { packageManager: "pnpm", monorepoPath: "apps/web" },
      // biome-ignore lint/suspicious/noExplicitAny: AI SDK execute options
      {} as any,
    );
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.method).toBe("PUT");
    expect(call.path).toBe("/_decopilot_vm/config");
    expect(typeof call.body).toBe("string");
    const decoded = JSON.parse(
      Buffer.from(call.body as string, "base64").toString("utf-8"),
    );
    expect(decoded).toEqual({
      application: { packageManager: { name: "pnpm", path: "apps/web" } },
    });
    expect(out).toEqual({
      transition: "pm-change",
      config: {
        packageManager: "pnpm",
        monorepoPath: "apps/web",
        runtime: "node",
        intent: "paused",
      },
    });
  });

  test("set_vm_config carries the caller's needsApproval flag", () => {
    const { runner } = fakeRunner(() => Response.json({}));
    const gated = createConfigTools({
      // biome-ignore lint/suspicious/noExplicitAny: test fake
      runner: runner as any,
      ensureHandle: async () => "h",
      needsApproval: true,
    });
    const open = createConfigTools({
      // biome-ignore lint/suspicious/noExplicitAny: test fake
      runner: runner as any,
      ensureHandle: async () => "h",
      needsApproval: false,
    });
    expect(
      (gated.set_vm_config as { needsApproval?: unknown }).needsApproval,
    ).toBe(true);
    expect(
      (open.set_vm_config as { needsApproval?: unknown }).needsApproval,
    ).toBe(false);
  });

  test("get_vm_config is never approval-gated regardless of caller flag", () => {
    const { runner } = fakeRunner(() => Response.json({}));
    const tools = createConfigTools({
      // biome-ignore lint/suspicious/noExplicitAny: test fake
      runner: runner as any,
      ensureHandle: async () => "h",
      needsApproval: true,
    });
    expect(
      (tools.get_vm_config as { needsApproval?: unknown }).needsApproval,
    ).toBe(false);
  });
});
