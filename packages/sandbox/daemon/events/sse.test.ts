import { describe, expect, it } from "bun:test";
import { Broadcaster } from "./broadcast";
import { makeSseStream } from "./sse";

describe("makeSseStream", () => {
  const mkDeps = (b: Broadcaster) => ({
    broadcaster: b,
    getLastStatus: () => ({ ready: false, htmlSupport: false }),
    getDiscoveredScripts: () => null,
    getActiveProcesses: () => [],
    getLastBranchStatus: () => null,
    maxClients: 10,
  });

  it("returns null when max clients exceeded", () => {
    const b = new Broadcaster(100);
    for (let i = 0; i < 10; i++) {
      b.register({
        enqueue: () => {},
      } as unknown as ReadableStreamDefaultController<Uint8Array>);
    }
    expect(makeSseStream(mkDeps(b))).toBeNull();
  });

  it("emits status event on connect", async () => {
    const b = new Broadcaster(100);
    const stream = makeSseStream(mkDeps(b))!;
    const reader = stream.getReader();
    const first = await reader.read();
    const text = new TextDecoder().decode(first.value);
    expect(text).toContain("event: status");
    await reader.cancel();
  });
});
