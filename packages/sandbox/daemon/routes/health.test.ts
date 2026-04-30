import { describe, expect, it } from "bun:test";
import { makeHealthHandler } from "./health";

describe("makeHealthHandler", () => {
  const cfg = { daemonBootId: "boot-xyz" } as const;

  it("returns ready:false, bootId, setup.running+done before probe", async () => {
    const h = makeHealthHandler({
      config: cfg,
      getReady: () => false,
      getSetup: () => ({ running: false, done: false }),
    });
    const res = h();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ready: boolean;
      bootId: string;
      setup: { running: boolean; done: boolean };
    };
    expect(body).toEqual({
      ready: false,
      bootId: "boot-xyz",
      setup: { running: false, done: false },
      phase: "ready",
    } as never);
  });

  it("flips ready:true once probe succeeds", async () => {
    let ready = false;
    const h = makeHealthHandler({
      config: cfg,
      getReady: () => ready,
      getSetup: () => ({ running: false, done: true }),
    });
    expect(((await h().json()) as { ready: boolean }).ready).toBe(false);
    ready = true;
    expect(((await h().json()) as { ready: boolean }).ready).toBe(true);
  });

  it("response has JSON content-type", () => {
    const h = makeHealthHandler({
      config: cfg,
      getReady: () => true,
      getSetup: () => ({ running: false, done: true }),
    });
    expect(h().headers.get("content-type")).toContain("application/json");
  });
});
