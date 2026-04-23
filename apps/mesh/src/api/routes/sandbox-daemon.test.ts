/**
 * Cross-tenant auth test. The daemon proxy is the only surface through
 * which a browser reaches the runner — any leak lets one user reach
 * another's container.
 */

import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import type { MeshContext } from "../../core/mesh-context";

const proxyDaemonRequest = mock(
  async (_handle: string, _path: string, _init: unknown) =>
    new Response("proxied", { status: 200 }),
);

const lastRequestedKind: { value: string | null } = { value: null };

function makeMockRunner(kind: "docker" | "freestyle") {
  return {
    kind,
    ensure: async () => ({
      handle: "h",
      workdir: "/app",
      previewUrl: null,
    }),
    exec: async () => ({
      stdout: "",
      stderr: "",
      exitCode: 0,
      timedOut: false,
    }),
    delete: async () => {},
    alive: async () => true,
    getPreviewUrl: async () => null,
    proxyDaemonRequest,
  };
}

mock.module("@/sandbox/lifecycle", () => ({
  getRunnerByKind: (_ctx: unknown, kind: "docker" | "freestyle") => {
    lastRequestedKind.value = kind;
    return makeMockRunner(kind);
  },
}));

const { createSandboxDaemonRoutes } = await import("./sandbox-daemon");

type RunnerStateRow = { user_id: string; runner_kind: string };

function makeCtxWithRow(
  userId: string | null,
  row: RunnerStateRow | null,
): MeshContext {
  return {
    auth: userId
      ? {
          user: {
            id: userId,
            email: "t@example.com",
            name: "t",
            role: "user",
          },
        }
      : null,
    db: {
      selectFrom: (_table: string) => ({
        select: (_cols: unknown) => ({
          where: (_col: string, _op: string, _val: string) => ({
            executeTakeFirst: async () => row ?? undefined,
          }),
        }),
      }),
    },
  } as unknown as MeshContext;
}

function mountWithCtx(ctx: MeshContext) {
  const app = new Hono<{ Variables: { meshContext: MeshContext } }>();
  app.use("*", async (c, next) => {
    c.set("meshContext", ctx);
    await next();
  });
  app.route("/", createSandboxDaemonRoutes());
  return app;
}

describe("sandbox daemon passthrough authorization", () => {
  beforeEach(() => {
    proxyDaemonRequest.mockClear();
    lastRequestedKind.value = null;
  });

  it("returns 401 when the session has no user", async () => {
    const app = mountWithCtx(makeCtxWithRow(null, null));
    const res = await app.request("/api/sandbox/handle_abc/_daemon/fs/read", {
      method: "POST",
    });
    expect(res.status).toBe(401);
    expect(proxyDaemonRequest).not.toHaveBeenCalled();
  });

  it("returns 404 when the handle belongs to a different user", async () => {
    const app = mountWithCtx(
      makeCtxWithRow("user_attacker", {
        user_id: "user_victim",
        runner_kind: "docker",
      }),
    );
    const res = await app.request(
      "/api/sandbox/handle_victim/_daemon/fs/read",
      { method: "POST" },
    );
    expect(res.status).toBe(404);
    // Must never forward on ownership mismatch — a leak here lets one user
    // reach another's container by knowing the handle.
    expect(proxyDaemonRequest).not.toHaveBeenCalled();
  });

  it("returns 404 when no row exists for the handle", async () => {
    const app = mountWithCtx(makeCtxWithRow("user_1", null));
    const res = await app.request(
      "/api/sandbox/handle_missing/_daemon/events",
      {
        method: "GET",
      },
    );
    expect(res.status).toBe(404);
    expect(proxyDaemonRequest).not.toHaveBeenCalled();
  });

  it("forwards to the runner when the caller owns the handle", async () => {
    const app = mountWithCtx(
      makeCtxWithRow("user_1", { user_id: "user_1", runner_kind: "docker" }),
    );
    const res = await app.request("/api/sandbox/handle_owned/_daemon/fs/read", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(proxyDaemonRequest).toHaveBeenCalledTimes(1);
    const [handle, path] = proxyDaemonRequest.mock.calls[0]! as [
      string,
      string,
      unknown,
    ];
    expect(handle).toBe("handle_owned");
    expect(path).toBe("/_daemon/fs/read");
  });

  it("rejects unsupported runner kinds with 400", async () => {
    const app = mountWithCtx(
      makeCtxWithRow("user_1", { user_id: "user_1", runner_kind: "k8s" }),
    );
    const res = await app.request("/api/sandbox/handle_k8s/_daemon/fs/read", {
      method: "POST",
    });
    expect(res.status).toBe(400);
    expect(proxyDaemonRequest).not.toHaveBeenCalled();
  });

  // Regression guard for the invariant called out in sandbox-daemon.ts:1–5:
  // a pod that flipped MESH_SANDBOX_RUNNER after the sandbox row was written
  // must still proxy to the kind of runner that owns the container.
  it("dispatches on the row's runner_kind even when MESH_SANDBOX_RUNNER env disagrees", async () => {
    const original = process.env.MESH_SANDBOX_RUNNER;
    process.env.MESH_SANDBOX_RUNNER = "freestyle";
    try {
      const app = mountWithCtx(
        makeCtxWithRow("user_1", {
          user_id: "user_1",
          runner_kind: "docker",
        }),
      );
      const res = await app.request(
        "/api/sandbox/handle_owned/_daemon/fs/read",
        { method: "POST" },
      );
      expect(res.status).toBe(200);
      expect(lastRequestedKind.value).toBe("docker");
      expect(proxyDaemonRequest).toHaveBeenCalledTimes(1);
    } finally {
      if (original === undefined) delete process.env.MESH_SANDBOX_RUNNER;
      else process.env.MESH_SANDBOX_RUNNER = original;
    }
  });
});
