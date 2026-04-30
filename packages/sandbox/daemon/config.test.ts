import { describe, expect, it } from "bun:test";
import { loadBootConfigFromEnv } from "./config";

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
