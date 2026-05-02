import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TenantConfigStore } from "../config-store";
import { makeConfigReadHandler, makeConfigUpdateHandler } from "./config";
import type { TenantConfig } from "../types";

const BOOT_ID = "boot-cfg-test";

function buildReq(method: "PUT" | "POST", body: object): Request {
  const b64 = Buffer.from(JSON.stringify(body), "utf-8").toString("base64");
  return new Request("http://x/_decopilot_vm/config", { method, body: b64 });
}

const SEED: TenantConfig = {
  git: {
    repository: {
      cloneUrl: "https://example.com/repo.git",
      repoName: "repo",
      branch: "main",
    },
  },
  application: {
    packageManager: { name: "npm" },
    runtime: "node",
    intent: "paused",
    desiredPort: 3000,
    proxy: {},
  },
};

describe("makeConfigUpdateHandler", () => {
  let storageDir: string;
  let store: TenantConfigStore;

  beforeEach(() => {
    storageDir = mkdtempSync(join(tmpdir(), "config-route-"));
    store = new TenantConfigStore({ storageDir });
  });

  afterEach(() => {
    rmSync(storageDir, { recursive: true, force: true });
  });

  function handler() {
    return makeConfigUpdateHandler({ daemonBootId: BOOT_ID, store });
  }

  it("first POST writes config and emits first-bootstrap", async () => {
    const h = handler();
    const res = await h(buildReq("POST", SEED));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { transition: string };
    expect(body.transition).toBe("first-bootstrap");
  });

  it("PUT branch=feature emits branch-change after seed", async () => {
    await store.apply(SEED);
    const h = handler();
    const res = await h(
      buildReq("PUT", { git: { repository: { branch: "feature" } } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { transition: string };
    expect(body.transition).toBe("branch-change");
  });

  it("PUT desiredPort emits desired-port-change", async () => {
    await store.apply(SEED);
    const h = handler();
    const res = await h(
      buildReq("PUT", { application: { desiredPort: 5173 } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { transition: string };
    expect(body.transition).toBe("desired-port-change");
  });

  it("PUT intent=running emits intent-change", async () => {
    await store.apply(SEED);
    const h = handler();
    const res = await h(
      buildReq("PUT", { application: { intent: "running" } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { transition: string };
    expect(body.transition).toBe("intent-change");
  });

  it("rejects mismatched cloneUrl with 409", async () => {
    await store.apply(SEED);
    const h = handler();
    const res = await h(
      buildReq("PUT", {
        git: {
          repository: { cloneUrl: "https://example.com/different.git" },
        },
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("cloneUrl");
  });

  it("accepts matching cloneUrl in patch (no-op or downstream change)", async () => {
    await store.apply(SEED);
    const h = handler();
    const res = await h(
      buildReq("PUT", {
        git: {
          repository: { cloneUrl: "https://example.com/repo.git" },
        },
        application: { desiredPort: 4000 },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("invalid desiredPort returns 400", async () => {
    await store.apply(SEED);
    const h = handler();
    const res = await h(
      buildReq("PUT", { application: { desiredPort: 70000 } }),
    );
    expect(res.status).toBe(400);
  });
});

describe("makeConfigReadHandler", () => {
  let storageDir: string;
  let store: TenantConfigStore;

  beforeEach(() => {
    storageDir = mkdtempSync(join(tmpdir(), "config-route-read-"));
    store = new TenantConfigStore({ storageDir });
  });

  afterEach(() => {
    rmSync(storageDir, { recursive: true, force: true });
  });

  it("404 when no tenant config", async () => {
    const h = makeConfigReadHandler({ daemonBootId: BOOT_ID, store });
    const res = await h();
    expect(res.status).toBe(404);
  });

  it("returns config + bootId when set", async () => {
    await store.apply(SEED);
    const h = makeConfigReadHandler({ daemonBootId: BOOT_ID, store });
    const res = await h();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      bootId: string;
      config: TenantConfig;
    };
    expect(body.bootId).toBe(BOOT_ID);
    expect(body.config.git?.repository?.cloneUrl).toBe(
      SEED.git?.repository?.cloneUrl,
    );
  });
});
