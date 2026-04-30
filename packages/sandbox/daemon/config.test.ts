import { describe, expect, it } from "bun:test";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  const base = {
    DAEMON_TOKEN: "t".repeat(32),
    DAEMON_BOOT_ID: "boot-abc",
  };

  it("parses minimal valid env (no clone, no workload)", () => {
    const cfg = loadConfig(base);
    expect(cfg.daemonToken).toBe(base.DAEMON_TOKEN);
    expect(cfg.daemonBootId).toBe("boot-abc");
    expect(cfg.cloneUrl).toBeNull();
    expect(cfg.packageManager).toBeNull();
    expect(cfg.devPort).toBe(3000);
    expect(cfg.runtime).toBe("node");
    expect(cfg.appRoot).toBe("/app");
    expect(cfg.proxyPort).toBe(9000);
    expect(cfg.pathPrefix).toBe("");
  });

  it("derives pathPrefix from runtime=bun", () => {
    const cfg = loadConfig({ ...base, RUNTIME: "bun" });
    expect(cfg.pathPrefix).toBe("export PATH=/opt/bun/bin:$PATH && ");
  });

  it("derives pathPrefix from runtime=deno", () => {
    const cfg = loadConfig({ ...base, RUNTIME: "deno" });
    expect(cfg.pathPrefix).toBe("export PATH=/opt/deno/bin:$PATH && ");
  });

  it("rejects DAEMON_TOKEN shorter than 32 chars", () => {
    expect(() => loadConfig({ ...base, DAEMON_TOKEN: "short" })).toThrow(
      /DAEMON_TOKEN/,
    );
  });

  it("rejects missing DAEMON_BOOT_ID", () => {
    expect(() => loadConfig({ DAEMON_TOKEN: base.DAEMON_TOKEN })).toThrow(
      /DAEMON_BOOT_ID/,
    );
  });

  it("rejects invalid BRANCH names", () => {
    expect(() =>
      loadConfig({
        ...base,
        CLONE_URL: "x",
        REPO_NAME: "x",
        BRANCH: "-danger",
        GIT_USER_NAME: "u",
        GIT_USER_EMAIL: "u@x",
      }),
    ).toThrow(/BRANCH/);
    expect(() =>
      loadConfig({
        ...base,
        CLONE_URL: "x",
        REPO_NAME: "x",
        BRANCH: "has space",
        GIT_USER_NAME: "u",
        GIT_USER_EMAIL: "u@x",
      }),
    ).toThrow(/BRANCH/);
  });

  it("rejects unknown PACKAGE_MANAGER", () => {
    expect(() => loadConfig({ ...base, PACKAGE_MANAGER: "nope" })).toThrow(
      /PACKAGE_MANAGER/,
    );
  });

  it("parses full clone + workload config", () => {
    const cfg = loadConfig({
      ...base,
      CLONE_URL: "https://x@github.com/org/repo.git",
      REPO_NAME: "org/repo",
      BRANCH: "deco/happy-panda",
      GIT_USER_NAME: "Deco",
      GIT_USER_EMAIL: "deco@example.com",
      PACKAGE_MANAGER: "pnpm",
      DEV_PORT: "4321",
      RUNTIME: "bun",
    });
    expect(cfg.cloneUrl).toBe("https://x@github.com/org/repo.git");
    expect(cfg.repoName).toBe("org/repo");
    expect(cfg.branch).toBe("deco/happy-panda");
    expect(cfg.packageManager).toBe("pnpm");
    expect(cfg.devPort).toBe(4321);
    expect(cfg.pathPrefix).toBe("export PATH=/opt/bun/bin:$PATH && ");
  });
});

describe("loadConfig cloneDepth", () => {
  const baseEnv = {
    DAEMON_TOKEN: "x".repeat(48),
    DAEMON_BOOT_ID: "boot",
  };

  it("defaults to shallow when CLONE_DEPTH is unset", () => {
    expect(loadConfig({ ...baseEnv }).cloneDepth).toBe("shallow");
  });

  it("returns 'full' when CLONE_DEPTH=full", () => {
    expect(loadConfig({ ...baseEnv, CLONE_DEPTH: "full" }).cloneDepth).toBe(
      "full",
    );
  });

  it("returns 'shallow' when CLONE_DEPTH=shallow", () => {
    expect(loadConfig({ ...baseEnv, CLONE_DEPTH: "shallow" }).cloneDepth).toBe(
      "shallow",
    );
  });

  it("throws on invalid CLONE_DEPTH", () => {
    expect(() => loadConfig({ ...baseEnv, CLONE_DEPTH: "deep" })).toThrow(
      /CLONE_DEPTH invalid/,
    );
  });
});

describe("loadConfig useCorepack", () => {
  const baseEnv = {
    DAEMON_TOKEN: "x".repeat(48),
    DAEMON_BOOT_ID: "boot",
  };

  it("defaults to true when USE_COREPACK is unset", () => {
    expect(loadConfig({ ...baseEnv }).useCorepack).toBe(true);
  });

  it("returns false when USE_COREPACK=false", () => {
    expect(loadConfig({ ...baseEnv, USE_COREPACK: "false" }).useCorepack).toBe(
      false,
    );
  });

  it("returns true when USE_COREPACK=true", () => {
    expect(loadConfig({ ...baseEnv, USE_COREPACK: "true" }).useCorepack).toBe(
      true,
    );
  });

  it("throws on invalid USE_COREPACK", () => {
    expect(() => loadConfig({ ...baseEnv, USE_COREPACK: "yes" })).toThrow(
      /USE_COREPACK invalid/,
    );
  });
});
