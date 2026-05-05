import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Session,
  readSession,
  writeSession,
  clearSession,
  sessionPath,
} from "./session";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "deco-session-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const sample: Session = {
  target: "https://studio.decocms.com",
  workspace: "tlgimenes",
  user: { id: "u_1", email: "tlgimenes@gmail.com" },
  token: "tok_abc",
  createdAt: "2026-05-04T12:00:00.000Z",
};

describe("sessionPath", () => {
  it("places session.json directly in the given data dir", () => {
    expect(sessionPath("/tmp/x")).toBe("/tmp/x/session.json");
  });
});

describe("writeSession + readSession", () => {
  it("round-trips a session object", async () => {
    await writeSession(dir, sample);
    expect(await readSession(dir)).toEqual(sample);
  });

  it("creates the data dir if it does not exist", async () => {
    const nested = join(dir, "nested", "deeper");
    await writeSession(nested, sample);
    expect(await readSession(nested)).toEqual(sample);
  });

  it("writes the file with mode 0600", async () => {
    await writeSession(dir, sample);
    const s = await stat(sessionPath(dir));
    // Mask off the file-type bits and compare permission bits.
    expect(s.mode & 0o777).toBe(0o600);
  });
});

describe("readSession", () => {
  it("returns null when the file does not exist", async () => {
    expect(await readSession(dir)).toBeNull();
  });

  it("returns null and does not throw when the file is malformed JSON", async () => {
    await writeFile(sessionPath(dir), "not-json", { mode: 0o600 });
    expect(await readSession(dir)).toBeNull();
  });

  it("returns null when the file is missing required fields", async () => {
    await writeFile(sessionPath(dir), JSON.stringify({ target: "x" }), {
      mode: 0o600,
    });
    expect(await readSession(dir)).toBeNull();
  });
});

describe("clearSession", () => {
  it("removes the session file", async () => {
    await writeSession(dir, sample);
    await clearSession(dir);
    expect(await readSession(dir)).toBeNull();
  });

  it("is a no-op when the file does not exist", async () => {
    await clearSession(dir);
    expect(await readSession(dir)).toBeNull();
  });
});
