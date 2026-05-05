import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { readSession, writeSession } from "../../lib/session";
import { logoutCommand } from "./logout";

let dir: string;
let logSpy: ReturnType<typeof spyOn>;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "deco-logout-"));
  logSpy = spyOn(console, "log").mockImplementation(() => {});
});

afterEach(async () => {
  logSpy.mockRestore();
  await rm(dir, { recursive: true, force: true });
});

describe("logoutCommand", () => {
  it("posts to the revoke endpoint, deletes the session, and exits 0", async () => {
    await writeSession(dir, {
      target: "https://studio.decocms.com",
      workspace: "tlgimenes",
      user: { id: "u_1", email: "tlgimenes@gmail.com" },
      token: "tok_abc",
      createdAt: "2026-05-04T00:00:00.000Z",
    });

    const fetchMock = mock(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://studio.decocms.com/api/auth/cli/revoke");
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        "Bearer tok_abc",
      );
      return new Response("", { status: 204 });
    });

    const code = await logoutCommand({ dataDir: dir, fetch: fetchMock });
    expect(code).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await readSession(dir)).toBeNull();
  });

  it("still deletes the session when revoke fails", async () => {
    await writeSession(dir, {
      target: "https://studio.decocms.com",
      workspace: "ws",
      user: { id: "u", email: "u@x" },
      token: "t",
      createdAt: "2026-05-04T00:00:00.000Z",
    });
    const fetchMock = mock(async () => {
      throw new Error("network down");
    });
    const code = await logoutCommand({ dataDir: dir, fetch: fetchMock });
    expect(code).toBe(0);
    expect(await readSession(dir)).toBeNull();
  });

  it("is a no-op + exit 0 when no session is present", async () => {
    const fetchMock = mock(async () => new Response("", { status: 204 }));
    const code = await logoutCommand({ dataDir: dir, fetch: fetchMock });
    expect(code).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });
});
