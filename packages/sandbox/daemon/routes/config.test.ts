import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearTenantConfig, setBootConfig, setTenantConfig } from "../state";
import { makeConfigUpdateHandler, type ConfigChangeKind } from "./config";
import type { TenantConfig } from "../types";

const BOOT_ID = "boot-cfg-test";

function buildReq(body: object): Request {
  const b64 = Buffer.from(JSON.stringify(body), "utf-8").toString("base64");
  return new Request("http://x/_decopilot_vm/config", {
    method: "PUT",
    body: b64,
  });
}

function seedTenant(overrides: Partial<TenantConfig> = {}): void {
  const tenant = {
    git: {
      repository: {
        cloneUrl: "https://example.com/repo.git",
        repoName: "repo",
        branch: "main",
      },
    },
    application: {
      packageManager: {
        name: "npm",
        path: undefined,
      },
      developmentServer: {
        port: 3000,
        running: false,
      },
      runtime: {
        name: "node",
        pathPrefix: "",
      },
    },
    ...overrides,
  };
  setTenantConfig(tenant as TenantConfig);
}

describe("makeConfigUpdateHandler", () => {
  let storageDir: string;
  let applied: Array<{ kind: ConfigChangeKind; tenant: TenantConfig }>;

  beforeEach(() => {
    storageDir = mkdtempSync(join(tmpdir(), "config-route-"));
    applied = [];
    setBootConfig({
      daemonToken: "x".repeat(32),
      daemonBootId: BOOT_ID,
      appRoot: "/tmp/app",
      proxyPort: 9000,
      dropPrivileges: false,
    });
    clearTenantConfig();
  });

  afterEach(() => {
    rmSync(storageDir, { recursive: true, force: true });
  });

  function makeHandler() {
    return makeConfigUpdateHandler({
      daemonBootId: BOOT_ID,
      storageDir,
      onApplied: (kind, tenant) => applied.push({ kind, tenant }),
    });
  }

  it("rejects 409 when no bootstrap is pinned yet", async () => {
    const h = makeHandler();
    const res = await h(buildReq({ devPort: 5173 }));
    expect(res.status).toBe(409);
    expect(applied).toHaveLength(0);
  });

  it("devport-only patch applies without re-orchestration", async () => {
    seedTenant();
    const h = makeHandler();
    const res = await h(buildReq({ devPort: 5173 }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { applied: ConfigChangeKind };
    expect(body.applied).toBe("devport-only");
    expect(applied).toHaveLength(1);
    expect(applied[0].kind).toBe("devport-only");
    expect(applied[0].tenant.application?.developmentServer?.port).toBe(5173);
    // mutable + identity preserved
    expect(applied[0].tenant.git?.repository?.cloneUrl).toBe(
      "https://example.com/repo.git",
    );
    expect(applied[0].tenant.git?.repository?.branch).toBe("main");
  });

  it("branch change is classified as rerun", async () => {
    seedTenant();
    const h = makeHandler();
    const res = await h(buildReq({ branch: "feature" }));
    expect(res.status).toBe(200);
    expect(applied[0].kind).toBe("rerun");
    expect(applied[0].tenant.git?.repository?.branch).toBe("feature");
  });

  it("rejects rerun-class change while phase=bootstrapping", async () => {
    seedTenant();
    const h = makeHandler();
    const res = await h(buildReq({ branch: "feature" }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("setup in progress");
    expect(applied).toHaveLength(0);
  });

  it("allows devport-only change while phase=bootstrapping", async () => {
    seedTenant();
    const h = makeHandler();
    const res = await h(buildReq({ devPort: 5173 }));
    expect(res.status).toBe(200);
    expect(applied[0].kind).toBe("devport-only");
  });

  it("rejects mismatched cloneUrl with identity-conflict reason", async () => {
    seedTenant();
    const h = makeHandler();
    const res = await h(
      buildReq({ cloneUrl: "https://example.com/different.git" }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { reason: string; error: string };
    expect(body.reason).toBe("identity-conflict");
    expect(body.error).toContain("cloneUrl");
    expect(applied).toHaveLength(0);
  });

  it("accepts matching cloneUrl in patch (no-op identity)", async () => {
    seedTenant();
    const h = makeHandler();
    const res = await h(
      buildReq({
        cloneUrl: "https://example.com/repo.git",
        devPort: 4000,
      }),
    );
    expect(res.status).toBe(200);
    expect(applied[0].kind).toBe("devport-only");
    expect(applied[0].tenant.application?.developmentServer?.port).toBe(4000);
  });

  it("invalid primary (not in commands) returns 400", async () => {
    seedTenant();
    const h = makeHandler();
    const res = await h(
      buildReq({ commands: { dev: "npm run dev" }, primary: "missing" }),
    );
    expect(res.status).toBe(400);
    expect(applied).toHaveLength(0);
  });

  it("invalid devPort returns 400", async () => {
    seedTenant();
    const h = makeHandler();
    const res = await h(buildReq({ devPort: 70000 }));
    expect(res.status).toBe(400);
    expect(applied).toHaveLength(0);
  });
});
