import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  makeReadHandler,
  makeWriteHandler,
  makeEditHandler,
  makeGrepHandler,
  makeGlobHandler,
} from "./fs";

const hasRg = spawnSync("which", ["rg"]).status === 0;

function b64(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf-8").toString("base64");
}

function post(path: string, obj: unknown): Request {
  return new Request(`http://x${path}`, { method: "POST", body: b64(obj) });
}

describe("fs handlers", () => {
  let appRoot = "";
  beforeEach(() => {
    appRoot = mkdtempSync(join(tmpdir(), "fs-handlers-"));
  });
  afterEach(() => {
    rmSync(appRoot, { recursive: true, force: true });
  });

  it("read: returns numbered content", async () => {
    writeFileSync(join(appRoot, "a.txt"), "one\ntwo\nthree\n");
    const h = makeReadHandler({ appRoot });
    const res = await h(post("/_decopilot_vm/read", { path: "a.txt" }));
    const body = (await res.json()) as { content: string; lineCount: number };
    expect(body.content).toContain("1\tone");
    expect(body.content).toContain("3\tthree");
    expect(body.lineCount).toBeGreaterThanOrEqual(3);
  });

  it("read: rejects binary files (null byte)", async () => {
    writeFileSync(join(appRoot, "bin"), Buffer.from([0, 1, 2, 3]));
    const h = makeReadHandler({ appRoot });
    const res = await h(post("/_decopilot_vm/read", { path: "bin" }));
    expect(res.status).toBe(400);
  });

  it("read: rejects path escape", async () => {
    const h = makeReadHandler({ appRoot });
    const res = await h(post("/_decopilot_vm/read", { path: "../etc/passwd" }));
    expect(res.status).toBe(400);
  });

  it("write: creates file and returns byte count", async () => {
    const h = makeWriteHandler({ appRoot });
    const res = await h(
      post("/_decopilot_vm/write", { path: "new.txt", content: "hello" }),
    );
    expect(res.status).toBe(200);
    expect(readFileSync(join(appRoot, "new.txt"), "utf-8")).toBe("hello");
  });

  it("edit: rejects when old_string doesn't match", async () => {
    writeFileSync(join(appRoot, "e.txt"), "abc");
    const h = makeEditHandler({ appRoot });
    const res = await h(
      post("/_decopilot_vm/edit", {
        path: "e.txt",
        old_string: "xyz",
        new_string: "q",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("edit: rejects multi-match without replace_all", async () => {
    writeFileSync(join(appRoot, "e.txt"), "a a a");
    const h = makeEditHandler({ appRoot });
    const res = await h(
      post("/_decopilot_vm/edit", {
        path: "e.txt",
        old_string: "a",
        new_string: "b",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("edit: applies replace_all", async () => {
    writeFileSync(join(appRoot, "e.txt"), "a a a");
    const h = makeEditHandler({ appRoot });
    const res = await h(
      post("/_decopilot_vm/edit", {
        path: "e.txt",
        old_string: "a",
        new_string: "b",
        replace_all: true,
      }),
    );
    expect(res.status).toBe(200);
    expect(readFileSync(join(appRoot, "e.txt"), "utf-8")).toBe("b b b");
  });

  (hasRg ? it : it.skip)("grep: returns matching content lines", async () => {
    writeFileSync(join(appRoot, "needle.txt"), "hello world\n");
    const h = makeGrepHandler({ appRoot });
    const res = await h(
      post("/_decopilot_vm/grep", {
        pattern: "hello",
        output_mode: "content",
      }),
    );
    const body = (await res.json()) as { results: string };
    expect(body.results).toContain("hello world");
  });

  (hasRg ? it : it.skip)("glob: returns matching file names", async () => {
    writeFileSync(join(appRoot, "x.txt"), "");
    const h = makeGlobHandler({ appRoot });
    const res = await h(post("/_decopilot_vm/glob", { pattern: "*.txt" }));
    const body = (await res.json()) as { files: string[] };
    expect(body.files).toContain("x.txt");
  });
});
