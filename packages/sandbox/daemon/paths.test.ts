import { describe, expect, it } from "bun:test";
import { safePath } from "./paths";

describe("safePath", () => {
  const root = "/app";

  it("resolves relative paths under root", () => {
    expect(safePath(root, "src/index.ts")).toBe("/app/src/index.ts");
  });

  it("returns root itself", () => {
    expect(safePath(root, "")).toBe("/app");
    expect(safePath(root, ".")).toBe("/app");
  });

  it("rejects paths that escape via ..", () => {
    expect(safePath(root, "../etc/passwd")).toBeNull();
    expect(safePath(root, "a/../../../etc")).toBeNull();
  });

  it("rejects absolute paths outside root", () => {
    expect(safePath(root, "/etc/passwd")).toBeNull();
  });

  it("allows absolute paths inside root", () => {
    expect(safePath(root, "/app/src/x.ts")).toBe("/app/src/x.ts");
  });
});
