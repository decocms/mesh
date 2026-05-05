import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeAppDomain } from "../lib/app-domain";
import { writeSession } from "../lib/session";
import { linkCommand, type SpawnFn, type TunnelOpener } from "./link";

let dir: string;
let cwdDir: string;
let logSpy: ReturnType<typeof spyOn>;

async function makeProject(name: string): Promise<string> {
  const projectDir = await mkdtemp(join(tmpdir(), "deco-link-cwd-"));
  await writeFile(
    join(projectDir, "package.json"),
    JSON.stringify({ name }, null, 2),
  );
  return projectDir;
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "deco-link-"));
  logSpy = spyOn(console, "log").mockImplementation(() => {});
});

afterEach(async () => {
  logSpy.mockRestore();
  await rm(dir, { recursive: true, force: true });
  if (cwdDir) await rm(cwdDir, { recursive: true, force: true });
});

describe("linkCommand", () => {
  it("opens a tunnel to localhost-<sha1-8>.deco.host with the session token", async () => {
    cwdDir = await makeProject("my-app");
    await writeSession(dir, {
      target: "https://studio.decocms.com",
      workspace: "tlgimenes",
      user: { id: "u_1", email: "u@x" },
      token: "tok_link",
      createdAt: "2026-05-04T00:00:00.000Z",
    });

    const expectedDomain = computeAppDomain("tlgimenes", "my-app");
    const tunnelOpener = mock<TunnelOpener>(async (params) => {
      expect(params.domain).toBe(expectedDomain);
      expect(params.localAddr).toBe("http://127.0.0.1:8787");
      expect(params.apiKey).toBe("tok_link");
      expect(params.server).toBe(`wss://${expectedDomain}`);
      return { closed: new Promise<void>(() => {}), close: () => {} };
    });

    const port = 8787;
    // Pretend the port is already listening so waitForPort returns instantly.
    const portWaiter = mock(async () => "127.0.0.1");

    const result = linkCommand({
      cwd: cwdDir,
      dataDir: dir,
      port,
      env: "BASE_URL",
      runCommand: [],
      tunnelOpener,
      portWaiter,
      copyClipboard: async () => true,
      ensureSession: async () => null, // session is already present
    });

    // Give the command a tick to call tunnelOpener and reach the await on closed.
    await new Promise((r) => setTimeout(r, 30));

    expect(tunnelOpener).toHaveBeenCalledTimes(1);

    // Cleanup so the test actually finishes.
    await result.cancel();
  });

  it("auto-triggers ensureSession when no session is present", async () => {
    cwdDir = await makeProject("my-app");
    const ensureSession = mock(async () => ({
      target: "https://studio.decocms.com",
      workspace: "ws",
      user: { id: "u", email: "u@x" },
      token: "tok",
      createdAt: "2026-05-04T00:00:00.000Z",
    }));
    const tunnelOpener = mock<TunnelOpener>(async () => ({
      closed: new Promise<void>(() => {}),
      close: () => {},
    }));

    const result = linkCommand({
      cwd: cwdDir,
      dataDir: dir,
      port: 8787,
      env: "BASE_URL",
      runCommand: [],
      tunnelOpener,
      portWaiter: async () => "127.0.0.1",
      copyClipboard: async () => false,
      ensureSession,
    });

    await new Promise((r) => setTimeout(r, 30));
    expect(ensureSession).toHaveBeenCalledTimes(1);
    expect(tunnelOpener).toHaveBeenCalledTimes(1);
    await result.cancel();
  });

  it("reconnects when the tunnel closes mid-session", async () => {
    cwdDir = await makeProject("my-app");
    await writeSession(dir, {
      target: "https://studio.decocms.com",
      workspace: "ws",
      user: { id: "u", email: "u@x" },
      token: "tok",
      createdAt: "2026-05-04T00:00:00.000Z",
    });

    let openCount = 0;
    const tunnelOpener = mock<TunnelOpener>(async () => {
      openCount += 1;
      // First call: a tunnel that closes immediately. Second: never closes.
      if (openCount === 1) {
        return { closed: Promise.resolve(), close: () => {} };
      }
      return { closed: new Promise<void>(() => {}), close: () => {} };
    });

    const result = linkCommand({
      cwd: cwdDir,
      dataDir: dir,
      port: 8787,
      env: "BASE_URL",
      runCommand: [],
      tunnelOpener,
      portWaiter: async () => "127.0.0.1",
      copyClipboard: async () => false,
      ensureSession: async () => null,
      reconnectDelayMs: 5,
    });

    // Allow time for the first tunnel to close and reconnect.
    await new Promise((r) => setTimeout(r, 60));
    expect(openCount).toBeGreaterThanOrEqual(2);
    await result.cancel();
  });

  it("returns non-zero when package.json is missing a name", async () => {
    cwdDir = await mkdtemp(join(tmpdir(), "deco-link-noname-"));
    await writeFile(join(cwdDir, "package.json"), "{}");
    await writeSession(dir, {
      target: "https://studio.decocms.com",
      workspace: "ws",
      user: { id: "u", email: "u@x" },
      token: "tok",
      createdAt: "2026-05-04T00:00:00.000Z",
    });

    const tunnelOpener = mock<TunnelOpener>(async () => ({
      closed: new Promise<void>(() => {}),
      close: () => {},
    }));
    const result = linkCommand({
      cwd: cwdDir,
      dataDir: dir,
      port: 8787,
      env: "BASE_URL",
      runCommand: [],
      tunnelOpener,
      portWaiter: async () => "127.0.0.1",
      copyClipboard: async () => false,
      ensureSession: async () => null,
    });
    expect(await result.exit).not.toBe(0);
    expect(tunnelOpener).toHaveBeenCalledTimes(0);
  });

  it("uses BASE_URL by default and respects the -e flag", async () => {
    cwdDir = await makeProject("my-app");
    await writeSession(dir, {
      target: "https://studio.decocms.com",
      workspace: "ws",
      user: { id: "u", email: "u@x" },
      token: "tok",
      createdAt: "2026-05-04T00:00:00.000Z",
    });

    let envSeen: NodeJS.ProcessEnv | undefined;
    const childSpawn = mock<SpawnFn>((_cmd, _args, opts) => {
      envSeen = opts.env;
      return {
        on: () => {},
        kill: () => {},
        exitCode: null,
      } as unknown as import("node:child_process").ChildProcess;
    });

    const tunnelOpener = mock<TunnelOpener>(async () => ({
      closed: new Promise<void>(() => {}),
      close: () => {},
    }));

    const result = linkCommand({
      cwd: cwdDir,
      dataDir: dir,
      port: 8787,
      env: "MY_PUBLIC_URL",
      runCommand: ["node", "server.js"],
      tunnelOpener,
      portWaiter: async () => "127.0.0.1",
      copyClipboard: async () => false,
      ensureSession: async () => null,
      spawn: childSpawn,
    });

    await new Promise((r) => setTimeout(r, 30));
    expect(childSpawn).toHaveBeenCalledTimes(1);
    expect(envSeen?.MY_PUBLIC_URL).toMatch(
      /^https:\/\/localhost-[0-9a-f]{8}\.deco\.host$/,
    );
    expect(envSeen?.BASE_URL).toBeUndefined();
    await result.cancel();
  });
});
