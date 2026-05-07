import { describe, expect, test } from "bun:test";
import { fetchLoopback } from "./upstream-fetch";

async function withServer(
  hostname: string,
  handler: (req: Request) => Response,
  fn: (port: number) => Promise<void>,
): Promise<void> {
  const server = Bun.serve({ port: 0, hostname, fetch: handler });
  try {
    await fn(server.port);
  } finally {
    server.stop(true);
  }
}

describe("fetchLoopback", () => {
  test("reaches an IPv6-only server (Bun's default for `localhost`)", async () => {
    await withServer(
      "::1",
      () => new Response("v6-ok"),
      async (port) => {
        const res = await fetchLoopback(port, "/");
        expect(await res.text()).toBe("v6-ok");
      },
    );
  });

  test("falls back to IPv4 when nothing listens on [::1]", async () => {
    await withServer(
      "127.0.0.1",
      () => new Response("v4-ok"),
      async (port) => {
        const res = await fetchLoopback(port, "/");
        expect(await res.text()).toBe("v4-ok");
      },
    );
  });

  test("forwards path and query", async () => {
    await withServer(
      "::1",
      (req) => {
        const url = new URL(req.url);
        return new Response(`${url.pathname}${url.search}`);
      },
      async (port) => {
        const res = await fetchLoopback(port, "/foo/bar?x=1");
        expect(await res.text()).toBe("/foo/bar?x=1");
      },
    );
  });

  test("forwards method and body via init", async () => {
    await withServer(
      "::1",
      async (req) => new Response(`${req.method}:${await req.text()}`),
      async (port) => {
        const res = await fetchLoopback(port, "/", {
          method: "POST",
          body: "payload",
        });
        expect(await res.text()).toBe("POST:payload");
      },
    );
  });

  test("throws when nothing listens on either address", async () => {
    // Pick a port unlikely to have anything; if collision flakes the test,
    // a higher random pick reduces the odds.
    const port = 49000 + Math.floor(Math.random() * 10000);
    await expect(fetchLoopback(port, "/")).rejects.toThrow();
  });
});
