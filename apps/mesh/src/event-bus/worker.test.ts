import { describe, expect, it, mock } from "bun:test";
import type { EventBusStorage, PendingDelivery } from "../storage/event-bus";
import type { Event, EventSubscription } from "../storage/types";
import { isAuthError } from "./notify";
import { EventBusWorker } from "./worker";

// ============================================================================
// isAuthError unit tests
// ============================================================================

describe("isAuthError", () => {
  it("detects '401' in message", () => {
    expect(isAuthError("401 Unauthorized")).toBe(true);
  });

  it("detects 'unauthorized' (case-insensitive)", () => {
    expect(isAuthError("Unauthorized access")).toBe(true);
    expect(isAuthError("UNAUTHORIZED")).toBe(true);
  });

  it("detects 'invalid_token'", () => {
    expect(isAuthError("Error: invalid_token")).toBe(true);
  });

  it("detects 'invalid api key'", () => {
    expect(isAuthError("Invalid API key provided")).toBe(true);
    expect(isAuthError("invalid api key")).toBe(true);
  });

  it("detects 'api key required'", () => {
    expect(isAuthError("API key required")).toBe(true);
  });

  it("detects 'api-key required'", () => {
    expect(isAuthError("api-key required")).toBe(true);
  });

  it("returns false for transient errors", () => {
    expect(isAuthError("connection refused")).toBe(false);
    expect(isAuthError("timeout")).toBe(false);
    expect(isAuthError("Internal server error")).toBe(false);
    expect(isAuthError("ECONNRESET")).toBe(false);
  });
});

// ============================================================================
// Helpers
// ============================================================================

function makeEvent(id: string, cron?: string): Event {
  return {
    id,
    organizationId: "org1",
    type: "test.event",
    source: "conn_publisher",
    specversion: "1.0",
    subject: null,
    time: new Date().toISOString(),
    datacontenttype: "application/json",
    dataschema: null,
    data: null,
    status: "pending",
    attempts: 0,
    lastError: null,
    nextRetryAt: null,
    cron: cron ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeSubscription(connectionId: string): EventSubscription {
  return {
    id: `sub_${connectionId}`,
    organizationId: "org1",
    connectionId,
    eventType: "test.event",
    publisher: null,
    filter: null,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makePendingDelivery(
  event: Event,
  connectionId: string,
  deliveryId = "delivery1",
): PendingDelivery {
  return {
    delivery: {
      id: deliveryId,
      eventId: event.id,
      subscriptionId: `sub_${connectionId}`,
      status: "processing",
      attempts: 0,
      nextRetryAt: null,
      lastError: null,
      deliveredAt: null,
      createdAt: new Date().toISOString(),
    },
    event,
    subscription: makeSubscription(connectionId),
  };
}

function makeStorage(
  overrides: Partial<EventBusStorage> = {},
): EventBusStorage {
  return {
    claimPendingDeliveries: mock(() => Promise.resolve([])),
    markDeliveriesDelivered: mock(() => Promise.resolve()),
    markDeliveriesFailed: mock(() => Promise.resolve()),
    scheduleRetryWithoutAttemptIncrement: mock(() => Promise.resolve()),
    resetStuckDeliveries: mock(() => Promise.resolve(0)),
    updateEventStatus: mock(() => Promise.resolve()),
    getMatchingSubscriptions: mock(() => Promise.resolve([])),
    createDeliveries: mock(() => Promise.resolve()),
    // Add any remaining required methods as needed
    ...overrides,
  } as unknown as EventBusStorage;
}

// ============================================================================
// Worker tests
// ============================================================================

describe("EventBusWorker", () => {
  describe("auth failure (permanent)", () => {
    it("calls markDeliveriesFailed with maxAttempts=1", async () => {
      const event = makeEvent("evt1");
      const pendingDelivery = makePendingDelivery(event, "conn_subscriber");

      const storage = makeStorage({
        claimPendingDeliveries: mock(() => Promise.resolve([pendingDelivery])),
        updateEventStatus: mock(() => Promise.resolve()),
      });

      const notifySubscriber = mock(() =>
        Promise.resolve({
          success: false as const,
          error: "401 Unauthorized",
          permanent: true,
        }),
      );

      const worker = new EventBusWorker(storage, {}, notifySubscriber);
      await worker.start();
      await worker.processNow();

      expect(storage.markDeliveriesFailed).toHaveBeenCalledWith(
        ["delivery1"],
        "401 Unauthorized",
        1, // maxAttempts=1 for permanent failures
        expect.any(Number),
        expect.any(Number),
      );
    });
  });

  describe("transient failure", () => {
    it("calls markDeliveriesFailed with default maxAttempts (20)", async () => {
      const event = makeEvent("evt2");
      const pendingDelivery = makePendingDelivery(
        event,
        "conn_subscriber",
        "delivery2",
      );

      const storage = makeStorage({
        claimPendingDeliveries: mock(() => Promise.resolve([pendingDelivery])),
        updateEventStatus: mock(() => Promise.resolve()),
      });

      const notifySubscriber = mock(() =>
        Promise.resolve({
          success: false as const,
          error: "connection refused",
        }),
      );

      const worker = new EventBusWorker(storage, {}, notifySubscriber);
      await worker.start();
      await worker.processNow();

      expect(storage.markDeliveriesFailed).toHaveBeenCalledWith(
        ["delivery2"],
        "connection refused",
        20, // default maxAttempts
        expect.any(Number),
        expect.any(Number),
      );
    });
  });

  describe("cron event with auth failure", () => {
    it("does NOT call scheduleNextCronDelivery", async () => {
      const event = makeEvent("evt3", "* * * * *");
      const pendingDelivery = makePendingDelivery(
        event,
        "conn_subscriber",
        "delivery3",
      );

      const storage = makeStorage({
        claimPendingDeliveries: mock(() => Promise.resolve([pendingDelivery])),
        updateEventStatus: mock(() => Promise.resolve()),
        getMatchingSubscriptions: mock(() =>
          Promise.resolve([makeSubscription("conn_subscriber")]),
        ),
        createDeliveries: mock(() => Promise.resolve()),
      });

      const notifySubscriber = mock(() =>
        Promise.resolve({
          success: false as const,
          error: "Invalid API key",
          permanent: true,
        }),
      );

      const worker = new EventBusWorker(storage, {}, notifySubscriber);
      await worker.start();
      await worker.processNow();

      // createDeliveries should NOT be called because event is permanently failed
      expect(storage.createDeliveries).not.toHaveBeenCalled();
    });
  });

  describe("cron event with transient failure", () => {
    it("DOES call scheduleNextCronDelivery", async () => {
      const event = makeEvent("evt4", "* * * * *");
      const pendingDelivery = makePendingDelivery(
        event,
        "conn_subscriber",
        "delivery4",
      );
      const sub = makeSubscription("conn_subscriber");

      const storage = makeStorage({
        claimPendingDeliveries: mock(() => Promise.resolve([pendingDelivery])),
        updateEventStatus: mock(() => Promise.resolve()),
        getMatchingSubscriptions: mock(() => Promise.resolve([sub])),
        createDeliveries: mock(() => Promise.resolve()),
      });

      const notifySubscriber = mock(() =>
        Promise.resolve({
          success: false as const,
          error: "connection refused",
        }),
      );

      const worker = new EventBusWorker(storage, {}, notifySubscriber);
      await worker.start();
      await worker.processNow();

      // createDeliveries SHOULD be called for transient failure
      expect(storage.createDeliveries).toHaveBeenCalled();
    });
  });

  describe("per-event results path", () => {
    it("is unaffected by permanent (batch-level only)", async () => {
      const event = makeEvent("evt5");
      const pendingDelivery = makePendingDelivery(
        event,
        "conn_subscriber",
        "delivery5",
      );

      const storage = makeStorage({
        claimPendingDeliveries: mock(() => Promise.resolve([pendingDelivery])),
        updateEventStatus: mock(() => Promise.resolve()),
        markDeliveriesDelivered: mock(() => Promise.resolve()),
      });

      // Per-event result: event succeeds
      const notifySubscriber = mock(() =>
        Promise.resolve({
          results: {
            evt5: { success: true as const },
          },
        }),
      );

      const worker = new EventBusWorker(storage, {}, notifySubscriber);
      await worker.start();
      await worker.processNow();

      expect(storage.markDeliveriesDelivered).toHaveBeenCalledWith([
        "delivery5",
      ]);
      expect(storage.markDeliveriesFailed).not.toHaveBeenCalled();
    });
  });
});
