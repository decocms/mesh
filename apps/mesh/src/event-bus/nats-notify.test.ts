import { describe, expect, mock, test } from "bun:test";
import type { NatsConnection, Subscription } from "nats";
import { NatsNotifyStrategy } from "./nats-notify";

function createMockConnection(): {
  nc: NatsConnection;
  subs: Subscription[];
} {
  const subs: Subscription[] = [];
  const nc = {
    subscribe: mock((subject: string) => {
      let resolveIterator: (() => void) | null = null;
      const sub: Subscription = {
        unsubscribe: mock(() => {
          resolveIterator?.();
        }),
        drain: mock(() => Promise.resolve()),
        isClosed: false,
        [Symbol.asyncIterator]: () => ({
          next: () =>
            new Promise<IteratorResult<unknown>>((resolve) => {
              resolveIterator = () => resolve({ done: true, value: undefined });
            }),
          return: () => Promise.resolve({ done: true, value: undefined }),
          throw: () => Promise.resolve({ done: true, value: undefined }),
        }),
      } as unknown as Subscription;
      subs.push(sub);
      return sub;
    }),
    publish: mock(() => {}),
    isClosed: () => false,
    isDraining: () => false,
  } as unknown as NatsConnection;

  return { nc, subs };
}

describe("NatsNotifyStrategy", () => {
  test("start() creates subscription", async () => {
    const { nc } = createMockConnection();
    const strategy = new NatsNotifyStrategy({ getConnection: () => nc });

    await strategy.start(() => {});

    expect(nc.subscribe).toHaveBeenCalledTimes(1);
  });

  test("start() re-subscribes when called again (reconnect scenario)", async () => {
    const { nc, subs } = createMockConnection();
    const strategy = new NatsNotifyStrategy({ getConnection: () => nc });

    await strategy.start(() => {});
    expect(nc.subscribe).toHaveBeenCalledTimes(1);

    // Simulate reconnect: start() is called again
    await strategy.start();
    expect(nc.subscribe).toHaveBeenCalledTimes(2);
    // Old subscription should have been unsubscribed
    expect(subs[0].unsubscribe).toHaveBeenCalledTimes(1);
  });

  test("stop() cleans up subscription", async () => {
    const { nc, subs } = createMockConnection();
    const strategy = new NatsNotifyStrategy({ getConnection: () => nc });

    await strategy.start(() => {});
    await strategy.stop();

    expect(subs[0].unsubscribe).toHaveBeenCalledTimes(1);
  });

  test("notify() publishes to correct subject", async () => {
    const { nc } = createMockConnection();
    const strategy = new NatsNotifyStrategy({ getConnection: () => nc });

    await strategy.notify("event-123");

    expect(nc.publish).toHaveBeenCalledWith(
      "mesh.events.notify",
      expect.any(Uint8Array),
    );
  });

  test("notify() silently succeeds when NATS is disconnected", async () => {
    const strategy = new NatsNotifyStrategy({ getConnection: () => null });

    // Should not throw
    await strategy.notify("event-123");
  });
});
