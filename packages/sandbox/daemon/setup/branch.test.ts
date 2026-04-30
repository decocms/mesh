import { describe, expect, it, mock } from "bun:test";
import { resolveBranch } from "./branch";
import type { Config } from "../types";

describe("resolveBranch", () => {
  const baseCfg: Config = {
    appRoot: "/app",
    branch: "main",
    daemonToken: "x".repeat(32),
    daemonBootId: "b",
    cloneUrl: null,
    repoName: null,
    gitUserName: null,
    gitUserEmail: null,
    packageManager: null,
    devPort: 3000,
    runtime: "node",
    proxyPort: 9000,
    pathPrefix: "",
  };

  it("uses origin branch when fetch succeeds", () => {
    const gitSync = mock(() => "");
    resolveBranch({ config: baseCfg, gitSync });
    expect(gitSync).toHaveBeenCalledWith(
      expect.arrayContaining(["fetch", "origin"]),
      expect.anything(),
    );
    expect(gitSync).toHaveBeenCalledWith(
      expect.arrayContaining(["checkout", "main"]),
      expect.anything(),
    );
  });

  it("creates local branch when fetch fails and local doesn't exist", () => {
    const gitSync = mock((args: string[]) => {
      const a = args[0] === "-c" ? args.slice(2) : args;
      if (a[0] === "fetch") {
        throw Object.assign(new Error("no branch"), { stderr: "" });
      }
      if (a[0] === "checkout" && a[1] !== "-b") {
        throw new Error("no local");
      }
      return "";
    });
    resolveBranch({
      config: { ...baseCfg, branch: "feature/x" },
      gitSync,
    });
    expect(gitSync).toHaveBeenCalledWith(
      expect.arrayContaining(["checkout", "-b", "feature/x"]),
      expect.anything(),
    );
  });

  it("no-ops when branch is null (e.g. clone-only)", () => {
    const gitSync = mock(() => "");
    resolveBranch({ config: { ...baseCfg, branch: null }, gitSync });
    expect(gitSync).not.toHaveBeenCalled();
  });
});
