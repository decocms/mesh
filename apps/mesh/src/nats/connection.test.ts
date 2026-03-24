import { describe, it, expect, mock } from "bun:test";
import { createNatsConnectionProvider } from "./connection";
import type { NatsConnection } from "nats";

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
    await expect(provider.drain()).resolves.toBeUndefined();
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
});
