import { describe, expect, it } from "bun:test";
import { loadBootConfigFromEnv, tryLoadTenantConfigFromEnv } from "./config";

const base = {
  DAEMON_TOKEN: "t".repeat(32),
  DAEMON_BOOT_ID: "boot-abc",
};

describe("loadBootConfigFromEnv", () => {
  it("parses minimal valid env", () => {
    const cfg = loadBootConfigFromEnv(base);
    expect(cfg.daemonToken).toBe(base.DAEMON_TOKEN);
    expect(cfg.daemonBootId).toBe("boot-abc");
    expect(cfg.appRoot).toBe("/app");
    expect(cfg.proxyPort).toBe(9000);
    expect(cfg.dropPrivileges).toBe(false);
  });

  it("respects APP_ROOT and DAEMON_DROP_PRIVILEGES", () => {
    const cfg = loadBootConfigFromEnv({
      ...base,
      APP_ROOT: "/work",
      DAEMON_DROP_PRIVILEGES: "1",
    });
    expect(cfg.appRoot).toBe("/work");
    expect(cfg.dropPrivileges).toBe(true);
  });

  it("rejects DAEMON_TOKEN shorter than 32 chars", () => {
    expect(() =>
      loadBootConfigFromEnv({ ...base, DAEMON_TOKEN: "short" }),
    ).toThrow(/DAEMON_TOKEN/);
  });

  it("rejects missing DAEMON_BOOT_ID", () => {
    expect(() =>
      loadBootConfigFromEnv({ DAEMON_TOKEN: base.DAEMON_TOKEN }),
    ).toThrow(/DAEMON_BOOT_ID/);
  });
});

describe("tryLoadTenantConfigFromEnv", () => {
  it("returns null when env carries no tenant material", () => {
    expect(tryLoadTenantConfigFromEnv({})).toBeNull();
  });

  it("derives pathPrefix from runtime=bun", () => {
    const cfg = tryLoadTenantConfigFromEnv({ RUNTIME: "bun" });
    expect(cfg?.application?.runtime?.pathPrefix).toBe(
      "export PATH=/opt/bun/bin:$PATH && ",
    );
  });

  it("derives pathPrefix from runtime=deno", () => {
    const cfg = tryLoadTenantConfigFromEnv({ RUNTIME: "deno" });
    expect(cfg?.application?.runtime?.pathPrefix).toBe(
      "export PATH=/opt/deno/bin:$PATH && ",
    );
  });

  it("rejects invalid BRANCH names", () => {
    expect(() =>
      tryLoadTenantConfigFromEnv({
        CLONE_URL: "x",
        REPO_NAME: "x",
        BRANCH: "-danger",
        GIT_USER_NAME: "u",
        GIT_USER_EMAIL: "u@x",
      }),
    ).toThrow(/BRANCH/);
    expect(() =>
      tryLoadTenantConfigFromEnv({
        CLONE_URL: "x",
        REPO_NAME: "x",
        BRANCH: "has space",
        GIT_USER_NAME: "u",
        GIT_USER_EMAIL: "u@x",
      }),
    ).toThrow(/BRANCH/);
  });

  it("rejects unknown PACKAGE_MANAGER", () => {
    expect(() =>
      tryLoadTenantConfigFromEnv({ RUNTIME: "node", PACKAGE_MANAGER: "nope" }),
    ).toThrow(/PACKAGE_MANAGER/);
  });

  it("parses full clone + workload config", () => {
    const cfg = tryLoadTenantConfigFromEnv({
      CLONE_URL: "https://x@github.com/org/repo.git",
      REPO_NAME: "org/repo",
      BRANCH: "deco/happy-panda",
      GIT_USER_NAME: "Deco",
      GIT_USER_EMAIL: "deco@example.com",
      PACKAGE_MANAGER: "pnpm",
      DEV_PORT: "4321",
      RUNTIME: "bun",
    });
    expect(cfg?.git?.repository?.cloneUrl).toBe(
      "https://x@github.com/org/repo.git",
    );
    expect(cfg?.git?.repository?.repoName).toBe("org/repo");
    expect(cfg?.git?.repository?.branch).toBe("deco/happy-panda");
    expect(cfg?.application?.packageManager?.name).toBe("pnpm");
    expect(cfg?.application?.developmentServer?.port).toBe(4321);
    expect(cfg?.application?.runtime?.pathPrefix).toBe(
      "export PATH=/opt/bun/bin:$PATH && ",
    );
  });
});
