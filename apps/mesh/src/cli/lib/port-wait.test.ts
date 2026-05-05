import { afterEach, describe, expect, it } from "bun:test";
import { type Server, createServer } from "node:net";
import { findRunningAddr, waitForPort } from "./port-wait";

const openServers: Server[] = [];

async function listenOn(host: string, port: number): Promise<void> {
  const srv = createServer();
  await new Promise<void>((resolve, reject) => {
    srv.once("error", reject);
    srv.listen(port, host, () => resolve());
  });
  openServers.push(srv);
}

async function ephemeralPort(): Promise<number> {
  const srv = createServer();
  return new Promise<number>((resolve, reject) => {
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

afterEach(() => {
  while (openServers.length) {
    const srv = openServers.pop();
    srv?.close();
  }
});

describe("findRunningAddr", () => {
  it("returns null when the port is unused", async () => {
    const port = await ephemeralPort();
    expect(await findRunningAddr(port)).toBeNull();
  });

  it("returns the host when something is listening", async () => {
    const port = await ephemeralPort();
    await listenOn("127.0.0.1", port);
    expect(await findRunningAddr(port)).toBe("127.0.0.1");
  });
});

describe("waitForPort", () => {
  it("resolves immediately when the port is already in use", async () => {
    const port = await ephemeralPort();
    await listenOn("127.0.0.1", port);
    expect(await waitForPort(port, { intervalMs: 10 })).toBe("127.0.0.1");
  });

  it("waits until the port becomes available, then resolves", async () => {
    const port = await ephemeralPort();
    const promise = waitForPort(port, { intervalMs: 20 });
    setTimeout(() => {
      void listenOn("127.0.0.1", port);
    }, 60);
    expect(await promise).toBe("127.0.0.1");
  });
});
