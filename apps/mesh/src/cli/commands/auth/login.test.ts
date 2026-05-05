import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSession } from "../../lib/session";
import { loginCommand } from "./login";

let dir: string;
let logSpy: ReturnType<typeof spyOn>;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "deco-login-"));
  logSpy = spyOn(console, "log").mockImplementation(() => {});
});

afterEach(async () => {
  logSpy.mockRestore();
  await rm(dir, { recursive: true, force: true });
});

describe("loginCommand", () => {
  it("opens the target login URL and exchanges the callback code for a session", async () => {
    let openedUrl: string | undefined;
    const openBrowser = mock(async (url: string) => {
      openedUrl = url;
      // Simulate the browser hitting the callback once the CLI has started its listener.
      const parsed = new URL(url);
      const callback = parsed.searchParams.get("callback")!;
      const state = parsed.searchParams.get("state")!;
      // Race condition guard: small delay so the CLI is past startOAuthCallbackServer.
      await new Promise((r) => setTimeout(r, 10));
      await fetch(`${callback}?code=code-xyz&state=${state}`);
    });

    const fetchMock = mock(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://studio.decocms.com/api/auth/cli/exchange");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(init?.body as string) as { code: string };
      expect(body.code).toBe("code-xyz");
      return new Response(
        JSON.stringify({
          token: "tok_new",
          workspace: "tlgimenes",
          user: { id: "u_1", email: "tlgimenes@gmail.com" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const code = await loginCommand({
      dataDir: dir,
      target: "https://studio.decocms.com",
      openBrowser,
      fetch: fetchMock,
    });

    expect(code).toBe(0);
    expect(openedUrl).toMatch(
      /^https:\/\/studio\.decocms\.com\/auth\/cli\?callback=http%3A%2F%2F127\.0\.0\.1%3A\d+&state=/,
    );
    const session = await readSession(dir);
    expect(session?.target).toBe("https://studio.decocms.com");
    expect(session?.workspace).toBe("tlgimenes");
    expect(session?.user.email).toBe("tlgimenes@gmail.com");
    expect(session?.token).toBe("tok_new");
  });

  it("defaults the target to https://studio.decocms.com", async () => {
    let openedUrl: string | undefined;
    const openBrowser = mock(async (url: string) => {
      openedUrl = url;
      const parsed = new URL(url);
      const callback = parsed.searchParams.get("callback")!;
      const state = parsed.searchParams.get("state")!;
      await new Promise((r) => setTimeout(r, 10));
      await fetch(`${callback}?code=c&state=${state}`);
    });
    const fetchMock = mock(
      async () =>
        new Response(
          JSON.stringify({
            token: "t",
            workspace: "w",
            user: { id: "u", email: "u@x" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    await loginCommand({ dataDir: dir, openBrowser, fetch: fetchMock });
    expect(openedUrl).toMatch(/^https:\/\/studio\.decocms\.com\//);
  });

  it("returns non-zero and writes no session when exchange fails", async () => {
    const openBrowser = mock(async (url: string) => {
      const parsed = new URL(url);
      const callback = parsed.searchParams.get("callback")!;
      const state = parsed.searchParams.get("state")!;
      await new Promise((r) => setTimeout(r, 10));
      await fetch(`${callback}?code=c&state=${state}`);
    });
    const fetchMock = mock(async () => new Response("nope", { status: 401 }));
    const code = await loginCommand({
      dataDir: dir,
      target: "https://studio.decocms.com",
      openBrowser,
      fetch: fetchMock,
    });
    expect(code).not.toBe(0);
    expect(await readSession(dir)).toBeNull();
  });
});
