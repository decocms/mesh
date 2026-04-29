import { describe, expect, it } from "bun:test";
import { __resetActivityForTests, bumpActivity } from "../activity";
import { makeIdleHandler } from "./idle";

describe("makeIdleHandler", () => {
  it("returns lastActivityAt + idleMs as JSON with CORS", async () => {
    const t0 = Date.UTC(2026, 3, 1, 12, 0, 0);
    __resetActivityForTests(t0);
    bumpActivity(t0);
    const handler = makeIdleHandler();
    const resp = handler();
    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type")).toContain("application/json");
    expect(resp.headers.get("access-control-allow-origin")).toBe("*");
    const body = (await resp.json()) as {
      lastActivityAt: string;
      idleMs: number;
    };
    expect(body.lastActivityAt).toBe(new Date(t0).toISOString());
    expect(typeof body.idleMs).toBe("number");
    expect(body.idleMs).toBeGreaterThanOrEqual(0);
  });
});
