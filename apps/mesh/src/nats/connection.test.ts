import { describe, it, expect, mock } from "bun:test";
import { createNatsConnectionProvider } from "./connection";
import { Events } from "nats";
import type { NatsConnection } from "nats";

function createStatusChannel(): {
  iterator: AsyncIterable<{ type: string; data: string }>;
  emitStatus: (event: { type: string; data: string }) => void;
} {
  const pending: Array<{ type: string; data: string }> = [];
  const waiters: Array<(v: { type: string; data: string }) => void> = [];

  function emitStatus(event: { type: string; data: string }): void {
    const waiter = waiters.shift();
    if (waiter) {
      waiter(event);
    } else {
      pending.push(event);
    }
  }

  const iterator = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<{ type: string; data: string }>> {
          const item = pending.shift();
          if (item) return Promise.resolve({ value: item, done: false });
          return new Promise((resolve) => {
            waiters.push((v) => resolve({ value: v, done: false }));
          });
        },
      };
    },
  };

  return { iterator, emitStatus };
}

function createControllableMock(): {
  conn: NatsConnection;
  emitStatus: (event: { type: string; data: string }) => void;
} {
  const { iterator, emitStatus } = createStatusChannel();
  const conn = {
    isClosed: () => false,
    isDraining: () => false,
    getServer: () => "nats://fake:4222",
    status: () => iterator,
    jetstream: () => ({ views: {} }),
    drain: async () => {},
    closed: () => new Promise(() => {}),
  } as unknown as NatsConnection;
  return { conn, emitStatus };
}

describe("createNatsConnectionProvider (unit)", () => {
  it("isConnected returns false before init", () => {
    const provider = createNatsConnectionProvider();
    expect(provider.isConnected()).toBe(false);
  });

  it("getConnection returns null before init", () => {
    const provider = createNatsConnectionProvider();
    expect(provider.getConnection()).toBeNull();
  });

  it("getJetStream returns null before init", () => {
    const provider = createNatsConnectionProvider();
    expect(provider.getJetStream()).toBeNull();
  });

  it("drain is safe to call before init (no throw)", async () => {
    const provider = createNatsConnectionProvider();
    expect(provider.drain()).resolves.toBeUndefined();
  });

  it("drain clears state so getConnection returns null after drain", async () => {
    const provider = createNatsConnectionProvider();
    await provider.drain();
    expect(provider.getConnection()).toBeNull();
    expect(provider.getJetStream()).toBeNull();
  });

  it("onReady callback fires when connectFn succeeds", async () => {
    const fakeNc = {
      isClosed: () => false,
      isDraining: () => false,
      jetstream: () => ({ views: {} }),
      getServer: () => "nats://fake:4222",
      status: () =>
        (async function* () {
          /* noop */
        })(),
      closed: () => new Promise(() => {}),
    } as unknown as NatsConnection;

    const connectFn = mock(async () => fakeNc);
    const provider = createNatsConnectionProvider({ connectFn });

    const readyPromise = new Promise<void>((resolve) => {
      provider.onReady(resolve);
    });

    provider.init("nats://fake:4222");
    await readyPromise;

    expect(provider.isConnected()).toBe(true);
    expect(provider.getConnection()).toBe(fakeNc);
    expect(connectFn).toHaveBeenCalledTimes(1);
  });

  it("retries with exponential backoff when connectFn fails", async () => {
    let attempt = 0;
    const fakeNc = {
      isClosed: () => false,
      isDraining: () => false,
      jetstream: () => ({ views: {} }),
      getServer: () => "nats://fake:4222",
      status: () =>
        (async function* () {
          /* noop */
        })(),
      closed: () => new Promise(() => {}),
    } as unknown as NatsConnection;

    const connectFn = mock(async () => {
      attempt++;
      if (attempt < 3) throw new Error("Connection refused");
      return fakeNc;
    });

    const provider = createNatsConnectionProvider({ connectFn });

    const readyPromise = new Promise<void>((resolve) => {
      provider.onReady(resolve);
    });

    provider.init("nats://fake:4222");
    await readyPromise;

    expect(connectFn).toHaveBeenCalledTimes(3);
    expect(provider.isConnected()).toBe(true);
  });

  it("isConnected checks nc.isClosed()", async () => {
    let closed = false;
    const fakeNc = {
      isClosed: () => closed,
      isDraining: () => false,
      jetstream: () => ({ views: {} }),
      getServer: () => "nats://fake:4222",
      status: () =>
        (async function* () {
          /* noop */
        })(),
      closed: () => new Promise(() => {}),
    } as unknown as NatsConnection;

    const connectFn = mock(async () => fakeNc);
    const provider = createNatsConnectionProvider({ connectFn });

    const readyPromise = new Promise<void>((resolve) => {
      provider.onReady(resolve);
    });
    provider.init("nats://fake:4222");
    await readyPromise;

    expect(provider.isConnected()).toBe(true);
    closed = true;
    expect(provider.isConnected()).toBe(false);
  });

  it("isConnected returns false after Events.Disconnect", async () => {
    const { conn, emitStatus } = createControllableMock();
    const connectFn = mock(async () => conn);
    const provider = createNatsConnectionProvider({ connectFn });

    const readyPromise = new Promise<void>((resolve) => {
      provider.onReady(resolve);
    });
    provider.init("nats://fake:4222");
    await readyPromise;

    expect(provider.isConnected()).toBe(true);

    emitStatus({ type: Events.Disconnect, data: "transport error" });
    await new Promise((r) => setTimeout(r, 10));

    expect(provider.isConnected()).toBe(false);
    expect(provider.getConnection()).toBeNull();
  });

  it("isConnected returns true again after Events.Reconnect", async () => {
    const { conn, emitStatus } = createControllableMock();
    const connectFn = mock(async () => conn);
    const provider = createNatsConnectionProvider({ connectFn });

    const readyPromise = new Promise<void>((resolve) => {
      provider.onReady(resolve);
    });
    provider.init("nats://fake:4222");
    await readyPromise;

    emitStatus({ type: Events.Disconnect, data: "transport error" });
    await new Promise((r) => setTimeout(r, 10));
    expect(provider.isConnected()).toBe(false);

    const reconnectPromise = new Promise<void>((resolve) => {
      provider.onReady(resolve);
    });
    emitStatus({ type: Events.Reconnect, data: "nats://fake:4222" });
    await reconnectPromise;

    expect(provider.isConnected()).toBe(true);
    expect(provider.getConnection()).toBe(conn);
  });

  it("getJetStream returns null while disconnected", async () => {
    const { conn, emitStatus } = createControllableMock();
    const connectFn = mock(async () => conn);
    const provider = createNatsConnectionProvider({ connectFn });

    const readyPromise = new Promise<void>((resolve) => {
      provider.onReady(resolve);
    });
    provider.init("nats://fake:4222");
    await readyPromise;

    expect(provider.getJetStream()).not.toBeNull();

    emitStatus({ type: Events.Disconnect, data: "transport error" });
    await new Promise((r) => setTimeout(r, 10));

    expect(provider.getJetStream()).toBeNull();
  });
});
