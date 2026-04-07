import { describe, it, expect } from "bun:test";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { createBridgeTransportPair } from "./bridge-transport.ts";

function makeMessage(id: number): JSONRPCMessage {
  return { jsonrpc: "2.0", method: "test", id } as JSONRPCMessage;
}

describe("createBridgeTransportPair", () => {
  it("creates a pair with client and server transports", () => {
    const { client, server, channel } = createBridgeTransportPair();
    expect(client).toBeDefined();
    expect(server).toBeDefined();
    expect(channel).toBeDefined();
  });
});

describe("bridge transport message passing", () => {
  it("client sends message that server receives", async () => {
    const { client, server } = createBridgeTransportPair();
    const received: JSONRPCMessage[] = [];

    await server.start();
    server.onmessage = (msg) => received.push(msg);
    await client.start();

    const msg = makeMessage(1);
    await client.send(msg);

    // Wait for microtask flush
    await new Promise<void>((r) => queueMicrotask(r));

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(msg);
  });

  it("server sends message that client receives", async () => {
    const { client, server } = createBridgeTransportPair();
    const received: JSONRPCMessage[] = [];

    await client.start();
    client.onmessage = (msg) => received.push(msg);
    await server.start();

    const msg = makeMessage(2);
    await server.send(msg);

    await new Promise<void>((r) => queueMicrotask(r));

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(msg);
  });
});

describe("FIFO ordering", () => {
  it("delivers messages in the order they were sent", async () => {
    const { client, server } = createBridgeTransportPair();
    const received: JSONRPCMessage[] = [];

    await server.start();
    server.onmessage = (msg) => received.push(msg);
    await client.start();

    const messages = Array.from({ length: 10 }, (_, i) => makeMessage(i));
    for (const msg of messages) {
      await client.send(msg);
    }

    await new Promise<void>((r) => queueMicrotask(r));

    expect(received).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      expect(received[i]).toBe(messages[i]);
    }
  });
});

describe("queue overflow protection", () => {
  it("throws when queue exceeds MAX_QUEUE_SIZE (10000)", async () => {
    const { client, server } = createBridgeTransportPair();

    // Start both sides but do NOT set onmessage so messages queue up
    // in the server queue. Since send() is async (wraps throws in rejected
    // promises), we collect promises and check for rejection.
    await server.start();
    await client.start();

    // send() calls enqueue() synchronously which throws on overflow.
    // Because send() is async, the throw becomes a rejected promise.
    const promises: Promise<void>[] = [];
    for (let i = 0; i <= 10_000; i++) {
      promises.push(client.send(makeMessage(i)));
    }

    // At least one of these promises should reject with queue overflow
    const results = await Promise.allSettled(promises);
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected.length).toBeGreaterThan(0);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(
      /queue overflow/,
    );
  });
});

describe("close semantics", () => {
  it("messages to a closed side are silently dropped", async () => {
    const { client, server } = createBridgeTransportPair();
    const received: JSONRPCMessage[] = [];

    await server.start();
    server.onmessage = (msg) => received.push(msg);
    await client.start();

    await server.close();
    await client.send(makeMessage(1));

    await new Promise<void>((r) => queueMicrotask(r));

    expect(received).toHaveLength(0);
  });

  it("sends from a closed transport are silently dropped", async () => {
    const { client, server } = createBridgeTransportPair();
    const received: JSONRPCMessage[] = [];

    await server.start();
    server.onmessage = (msg) => received.push(msg);
    await client.start();

    await client.close();
    await client.send(makeMessage(1));

    await new Promise<void>((r) => queueMicrotask(r));

    expect(received).toHaveLength(0);
  });

  it("closing one side triggers onclose on the opposite side", async () => {
    const { client, server } = createBridgeTransportPair();
    let serverOnCloseCalled = false;

    await server.start();
    server.onclose = () => {
      serverOnCloseCalled = true;
    };
    await client.start();

    await client.close();
    expect(serverOnCloseCalled).toBe(true);
  });
});

describe("double start", () => {
  it("throws when start() is called twice on client transport", async () => {
    const { client } = createBridgeTransportPair();
    await client.start();
    await expect(client.start()).rejects.toThrow(/already started/);
  });

  it("throws when start() is called twice on server transport", async () => {
    const { server } = createBridgeTransportPair();
    await server.start();
    await expect(server.start()).rejects.toThrow(/already started/);
  });
});

describe("splice-based drain", () => {
  it("delivers all queued messages via splice-based batch drain", async () => {
    const { client, server } = createBridgeTransportPair();
    const received: JSONRPCMessage[] = [];

    // Start both, set onmessage on server
    await server.start();
    server.onmessage = (msg) => received.push(msg);
    await client.start();

    // Send multiple messages synchronously (no awaits between sends to avoid
    // yielding to microtasks). They all queue up, then a single microtask
    // flush drains them all via splice(0).
    client.send(makeMessage(10));
    client.send(makeMessage(11));
    client.send(makeMessage(12));

    // Let the microtask flush run
    await new Promise<void>((r) => queueMicrotask(r));

    expect(received).toHaveLength(3);
    expect((received[0] as any).id).toBe(10);
    expect((received[1] as any).id).toBe(11);
    expect((received[2] as any).id).toBe(12);
  });

  it("delivers messages when onmessage is set triggering flush", async () => {
    const { client, server } = createBridgeTransportPair();
    const received: JSONRPCMessage[] = [];

    // Start both sides, send messages without onmessage set, then set it.
    // The onmessage setter triggers a flush which drains any remaining messages.
    await server.start();
    await client.start();

    // Send synchronously (no awaits) to keep messages in queue
    client.send(makeMessage(1));
    client.send(makeMessage(2));

    // Setting onmessage triggers channel.flush(this.side) in the setter.
    // But the microtask flush may have already run. To ensure messages are
    // in queue, we rely on the fact that the microtask scheduled by send()
    // will deliver to the now-set onmessage handler.
    server.onmessage = (msg) => received.push(msg);

    // Let microtasks run
    await new Promise<void>((r) => queueMicrotask(r));

    expect(received).toHaveLength(2);
    expect((received[0] as any).id).toBe(1);
    expect((received[1] as any).id).toBe(2);
  });

  it("start() flushes messages queued before start when onmessage is set before start()", async () => {
    // flush() returns early when transport is not started yet, leaving messages in queue.
    // start() calls flush() again once started=true, delivering the queued messages.
    const { client, server } = createBridgeTransportPair();
    const received: JSONRPCMessage[] = [];

    // Send before server starts; the scheduled microtask flush will leave
    // messages in queue because started=false at flush time.
    client.send(makeMessage(1));
    client.send(makeMessage(2));

    // Set onmessage then start — start() calls flush() which now delivers.
    server.onmessage = (msg) => received.push(msg);
    await server.start();

    await new Promise<void>((r) => queueMicrotask(r));

    expect(received).toHaveLength(2);
    expect((received[0] as any).id).toBe(1);
    expect((received[1] as any).id).toBe(2);
  });

  it("messages queued before start() are silently lost when onmessage is set after awaiting start()", async () => {
    // awaiting start() drains the microtask queue; the scheduled flush runs with
    // started=true but onmessage=undefined, so deliverMessage no-ops and the
    // messages are consumed. Setting onmessage afterwards finds an empty queue.
    const { client, server } = createBridgeTransportPair();
    const received: JSONRPCMessage[] = [];

    client.send(makeMessage(1));
    client.send(makeMessage(2));

    // Awaiting start() lets the microtask flush run; messages are delivered to
    // a no-op handler (onmessage not yet set) and permanently lost.
    await server.start();
    server.onmessage = (msg) => received.push(msg);

    await new Promise<void>((r) => queueMicrotask(r));

    expect(received).toHaveLength(0);
  });
});

describe("error handling", () => {
  it("calls onerror when onmessage throws", async () => {
    const { client, server } = createBridgeTransportPair();
    const errors: Error[] = [];

    await server.start();
    server.onmessage = () => {
      throw new Error("handler error");
    };
    server.onerror = (err) => errors.push(err);
    await client.start();

    await client.send(makeMessage(1));
    await new Promise<void>((r) => queueMicrotask(r));

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe("handler error");
  });
});
