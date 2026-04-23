/**
 * Docker-vs-Freestyle path mapping is easy to break silently; covered
 * explicitly.
 */

import { describe, expect, it, mock } from "bun:test";

// Avoid pulling the freestyle SDK at import time — we only test the translator.
mock.module("freestyle-sandboxes", () => ({
  freestyle: {},
  VmSpec: class {},
}));
mock.module("@freestyle-sh/with-deno", () => ({ VmDeno: class {} }));
mock.module("@freestyle-sh/with-bun", () => ({ VmBun: class {} }));
mock.module("@freestyle-sh/with-nodejs", () => ({ VmNodeJs: class {} }));

const { translateDaemonPath } = await import("./freestyle-runner");

describe("translateDaemonPath", () => {
  it("maps /_daemon/fs/<op> to /_decopilot_vm/<op>", () => {
    expect(translateDaemonPath("/_daemon/fs/read")).toBe("/_decopilot_vm/read");
    expect(translateDaemonPath("/_daemon/fs/write")).toBe(
      "/_decopilot_vm/write",
    );
    expect(translateDaemonPath("/_daemon/fs/edit")).toBe("/_decopilot_vm/edit");
    expect(translateDaemonPath("/_daemon/fs/grep")).toBe("/_decopilot_vm/grep");
    expect(translateDaemonPath("/_daemon/fs/glob")).toBe("/_decopilot_vm/glob");
  });

  it("maps /_daemon/bash to /_decopilot_vm/bash", () => {
    expect(translateDaemonPath("/_daemon/bash")).toBe("/_decopilot_vm/bash");
  });

  it("passes through /_daemon/_decopilot_vm/* (browser SSE shape)", () => {
    expect(translateDaemonPath("/_daemon/_decopilot_vm/events")).toBe(
      "/_decopilot_vm/events",
    );
    expect(translateDaemonPath("/_daemon/_decopilot_vm/scripts")).toBe(
      "/_decopilot_vm/scripts",
    );
    expect(translateDaemonPath("/_daemon/_decopilot_vm/exec/dev")).toBe(
      "/_decopilot_vm/exec/dev",
    );
  });

  it("returns null for /_daemon/dev/* (no freestyle analogue)", () => {
    expect(translateDaemonPath("/_daemon/dev/start")).toBeNull();
    expect(translateDaemonPath("/_daemon/dev/stop")).toBeNull();
    expect(translateDaemonPath("/_daemon/dev")).toBeNull();
  });

  it("strips /_daemon prefix and falls through unrecognised tails", () => {
    expect(translateDaemonPath("/_daemon/something/else")).toBe(
      "/something/else",
    );
  });

  it("preserves query strings on the translated path", () => {
    expect(translateDaemonPath("/_daemon/fs/read?path=/app/src/x.ts")).toBe(
      "/_decopilot_vm/read?path=/app/src/x.ts",
    );
  });

  it("normalises an empty stripped path to /", () => {
    expect(translateDaemonPath("/_daemon")).toBe("/");
  });
});
