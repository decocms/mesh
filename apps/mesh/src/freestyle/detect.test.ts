import { describe, test, expect } from "bun:test";
import { detectRepo, type RepoFileReader } from "./detect";

function mockReader(files: Record<string, string | null>): RepoFileReader {
  return {
    readFile: async (_owner: string, _repo: string, path: string) =>
      files[path] ?? null,
  };
}

describe("detectRepo", () => {
  test("detects bun project with scripts", async () => {
    const result = await detectRepo(
      "owner/repo",
      mockReader({
        "package.json": JSON.stringify({
          scripts: { dev: "bun run dev", build: "bun run build" },
        }),
        "bun.lock": "lockfile content",
      }),
    );

    expect(result.runtime).toBe("bun");
    expect(result.scripts).toEqual({
      dev: "bun run dev",
      build: "bun run build",
    });
    expect(result.instructions).toBeNull();
    expect(result.autorun).toBeNull();
    expect(result.preview_port).toBeNull();
  });

  test("reads AGENTS.md as instructions", async () => {
    const result = await detectRepo(
      "owner/repo",
      mockReader({
        "package.json": JSON.stringify({ scripts: {} }),
        "bun.lock": "lockfile",
        "AGENTS.md": "You are a helpful agent.",
      }),
    );

    expect(result.instructions).toBe("You are a helpful agent.");
  });

  test("throws when no JS project files found", async () => {
    await expect(detectRepo("owner/repo", mockReader({}))).rejects.toThrow(
      "does not appear to be a JavaScript project",
    );
  });

  // deno detection tests

  test("detects deno project from deno.json", async () => {
    const result = await detectRepo(
      "owner/repo",
      mockReader({
        "deno.json": JSON.stringify({
          tasks: {
            dev: "deno run --allow-net main.ts",
            start: "deno run main.ts",
          },
        }),
      }),
    );

    expect(result.runtime).toBe("deno");
    expect(result.scripts).toEqual({
      dev: "deno run --allow-net main.ts",
      start: "deno run main.ts",
    });
  });

  test("detects deno project from deno.jsonc", async () => {
    const result = await detectRepo(
      "owner/repo",
      mockReader({
        "deno.jsonc": JSON.stringify({ tasks: { dev: "deno run dev.ts" } }),
      }),
    );

    expect(result.runtime).toBe("deno");
    expect(result.scripts).toEqual({ dev: "deno run dev.ts" });
  });

  test("detects deno project from deno.lock only", async () => {
    const result = await detectRepo(
      "owner/repo",
      mockReader({
        "deno.lock": "lockfile",
        "package.json": JSON.stringify({ scripts: { dev: "npm run dev" } }),
      }),
    );

    expect(result.runtime).toBe("deno");
    // Falls back to package.json scripts when no deno.json tasks
    expect(result.scripts).toEqual({ dev: "npm run dev" });
  });

  test("prefers deno.json tasks over package.json scripts for deno runtime", async () => {
    const result = await detectRepo(
      "owner/repo",
      mockReader({
        "deno.json": JSON.stringify({ tasks: { dev: "deno task dev" } }),
        "package.json": JSON.stringify({ scripts: { dev: "npm run dev" } }),
        "deno.lock": "lockfile",
      }),
    );

    expect(result.runtime).toBe("deno");
    expect(result.scripts).toEqual({ dev: "deno task dev" });
  });

  test("deco.json runtime override from bun to deno", async () => {
    const result = await detectRepo(
      "owner/repo",
      mockReader({
        "package.json": JSON.stringify({ scripts: { dev: "bun dev" } }),
        "bun.lock": "lockfile",
        "deco.json": JSON.stringify({ runtime: "deno" }),
      }),
    );

    expect(result.runtime).toBe("deno");
  });

  test("deco.json runtime override from deno to bun", async () => {
    const result = await detectRepo(
      "owner/repo",
      mockReader({
        "deno.json": JSON.stringify({ tasks: { dev: "deno dev" } }),
        "deco.json": JSON.stringify({ runtime: "bun" }),
      }),
    );

    expect(result.runtime).toBe("bun");
  });

  // deco.json tests

  test("reads deco.json with all fields", async () => {
    const result = await detectRepo(
      "owner/repo",
      mockReader({
        "package.json": JSON.stringify({ scripts: { dev: "bun dev" } }),
        "bun.lock": "lockfile",
        "deco.json": JSON.stringify({
          autorun: "dev",
          runtime: "bun",
          previewPort: 3000,
        }),
      }),
    );

    expect(result.autorun).toBe("dev");
    expect(result.preview_port).toBe(3000);
  });

  test("reads deco.json with partial fields", async () => {
    const result = await detectRepo(
      "owner/repo",
      mockReader({
        "package.json": JSON.stringify({ scripts: {} }),
        "bun.lock": "lockfile",
        "deco.json": JSON.stringify({ autorun: "start" }),
      }),
    );

    expect(result.autorun).toBe("start");
    expect(result.preview_port).toBeNull();
  });

  test("silently skips malformed deco.json", async () => {
    const result = await detectRepo(
      "owner/repo",
      mockReader({
        "package.json": JSON.stringify({ scripts: {} }),
        "bun.lock": "lockfile",
        "deco.json": "not json",
      }),
    );

    expect(result.autorun).toBeNull();
    expect(result.preview_port).toBeNull();
  });

  test("silently skips deco.json with wrong types", async () => {
    const result = await detectRepo(
      "owner/repo",
      mockReader({
        "package.json": JSON.stringify({ scripts: {} }),
        "bun.lock": "lockfile",
        "deco.json": JSON.stringify({
          autorun: 123,
          previewPort: "abc",
        }),
      }),
    );

    expect(result.autorun).toBeNull();
    expect(result.preview_port).toBeNull();
  });

  test("rejects deco.json previewPort out of range", async () => {
    const result = await detectRepo(
      "owner/repo",
      mockReader({
        "package.json": JSON.stringify({ scripts: {} }),
        "bun.lock": "lockfile",
        "deco.json": JSON.stringify({ previewPort: 99999 }),
      }),
    );

    expect(result.preview_port).toBeNull();
  });

  test("rejects deco.json previewPort of 0", async () => {
    const result = await detectRepo(
      "owner/repo",
      mockReader({
        "package.json": JSON.stringify({ scripts: {} }),
        "bun.lock": "lockfile",
        "deco.json": JSON.stringify({ previewPort: 0 }),
      }),
    );

    expect(result.preview_port).toBeNull();
  });

  test("rejects deco.json previewPort negative", async () => {
    const result = await detectRepo(
      "owner/repo",
      mockReader({
        "package.json": JSON.stringify({ scripts: {} }),
        "bun.lock": "lockfile",
        "deco.json": JSON.stringify({ previewPort: -1 }),
      }),
    );

    expect(result.preview_port).toBeNull();
  });

  test("accepts deco.json previewPort at boundaries", async () => {
    const result1 = await detectRepo(
      "owner/repo",
      mockReader({
        "package.json": JSON.stringify({ scripts: {} }),
        "bun.lock": "lockfile",
        "deco.json": JSON.stringify({ previewPort: 1 }),
      }),
    );
    expect(result1.preview_port).toBe(1);

    const result2 = await detectRepo(
      "owner/repo",
      mockReader({
        "package.json": JSON.stringify({ scripts: {} }),
        "bun.lock": "lockfile",
        "deco.json": JSON.stringify({ previewPort: 65535 }),
      }),
    );
    expect(result2.preview_port).toBe(65535);
  });

  test("absent deco.json returns null fields", async () => {
    const result = await detectRepo(
      "owner/repo",
      mockReader({
        "package.json": JSON.stringify({ scripts: {} }),
        "bun.lock": "lockfile",
      }),
    );

    expect(result.autorun).toBeNull();
    expect(result.preview_port).toBeNull();
  });
});
