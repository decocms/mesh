import { describe, expect, it } from "bun:test";
import { spawnClone } from "./clone";
import type { Config } from "../types";

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    daemonToken: "x".repeat(48),
    daemonBootId: "boot",
    cloneUrl: "https://example.com/repo.git",
    repoName: "repo",
    branch: "main",
    gitUserName: "u",
    gitUserEmail: "u@example.com",
    packageManager: null,
    devPort: 3000,
    runtime: "node",
    appRoot: "/tmp/app",
    proxyPort: 9000,
    pathPrefix: "",
    cloneDepth: "shallow",
    ...overrides,
  };
}

describe("spawnClone command shape", () => {
  it("uses --depth 1 when cloneDepth=shallow", async () => {
    const chunks: string[] = [];
    void spawnClone({
      config: makeConfig({
        cloneDepth: "shallow",
        cloneUrl: "https://invalid.invalid/x.git",
      }),
      onChunk: (_, data) => chunks.push(data),
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(chunks.join("")).toMatch(/--depth 1/);
  });

  it("does NOT use --depth 1 when cloneDepth=full", async () => {
    const chunks: string[] = [];
    void spawnClone({
      config: makeConfig({
        cloneDepth: "full",
        cloneUrl: "https://invalid.invalid/x.git",
      }),
      onChunk: (_, data) => chunks.push(data),
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(chunks.join("")).not.toMatch(/--depth 1/);
  });
});
