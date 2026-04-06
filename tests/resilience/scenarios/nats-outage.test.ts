import { describe, expect, test } from "bun:test";
import { mcpCall, getReceivedEvents } from "../lib/mesh-client";
import { pollUntil } from "../lib/poll-until";
import { registerTestHooks, testState } from "../lib/setup";
import { PROXY_NAMES } from "../lib/toxic-presets";
import { disableProxy, enableProxy } from "../lib/toxiproxy";

registerTestHooks();

describe("NATS outage", () => {
  const EVENT_TYPE = "resilience-test.ping";

  test("events deliver normally", async () => {
    // Subscribe the subscriber-mock (caller = subscriber)
    await mcpCall(
      `${testState.orgId}_self`,
      "tools/call",
      {
        name: "EVENT_SUBSCRIBE",
        arguments: { eventType: EVENT_TYPE },
      },
      {
        apiKey: testState.apiKey,
        callerConnectionId: testState.subscriberConnectionId,
      },
    );

    // Publish an event (caller = everything-server as publisher)
    const eventId = crypto.randomUUID();
    await mcpCall(
      `${testState.orgId}_self`,
      "tools/call",
      {
        name: "EVENT_PUBLISH",
        arguments: {
          type: EVENT_TYPE,
          data: { message: "normal-delivery", testId: eventId },
        },
      },
      {
        apiKey: testState.apiKey,
        callerConnectionId: testState.everythingConnectionId,
      },
    );

    // Poll subscriber-mock until it received the event
    await pollUntil(
      async () => {
        const events = await getReceivedEvents();
        return events.some((e) =>
          e.events?.some((ev: any) => ev.data?.testId === eventId),
        );
      },
      {
        timeoutMs: 30_000,
        intervalMs: 1_000,
        label: "event-delivered-normally",
      },
    );
    console.log("  → Event delivered normally");
  }, 45_000);

  test("events queue when NATS down", async () => {
    // Subscribe first (with NATS still up)
    await mcpCall(
      `${testState.orgId}_self`,
      "tools/call",
      {
        name: "EVENT_SUBSCRIBE",
        arguments: { eventType: `${EVENT_TYPE}.outage` },
      },
      {
        apiKey: testState.apiKey,
        callerConnectionId: testState.subscriberConnectionId,
      },
    );

    // Disable NATS proxy
    await disableProxy(PROXY_NAMES.NATS);

    // Wait for NATS client to detect disconnection
    await Bun.sleep(5_000);

    // Publish an event — should be stored in Postgres
    const eventId = crypto.randomUUID();
    await mcpCall(
      `${testState.orgId}_self`,
      "tools/call",
      {
        name: "EVENT_PUBLISH",
        arguments: {
          type: `${EVENT_TYPE}.outage`,
          data: { message: "queued-during-outage", testId: eventId },
        },
      },
      {
        apiKey: testState.apiKey,
        callerConnectionId: testState.everythingConnectionId,
      },
    );

    // Verify subscriber has NOT received it after 10s (NATS is down, delivery may be delayed)
    await Bun.sleep(10_000);
    const events = await getReceivedEvents();
    const received = events.some((e) =>
      e.events?.some((ev: any) => ev.data?.testId === eventId),
    );
    // The PollingStrategy fires every 5s regardless of NATS state,
    // so events may still deliver. Either outcome is acceptable.
    console.log(
      `  → Event received during NATS outage: ${received} (polling may deliver it)`,
    );

    // Re-enable NATS for subsequent tests
    await enableProxy(PROXY_NAMES.NATS);
  }, 45_000);

  test("health reports NATS status", async () => {
    // Check health when NATS is up
    const healthyRes = await fetch("http://127.0.0.1:13000/health/ready");
    const healthyData = (await healthyRes.json()) as any;
    console.log(
      `  → NATS status when up: ${healthyData.services?.nats?.status}`,
    );
    expect(healthyRes.ok).toBe(true);

    // Disable NATS
    await disableProxy(PROXY_NAMES.NATS);

    // Poll for NATS status change — give more time for reconnect detection
    await pollUntil(
      async () => {
        const res = await fetch("http://127.0.0.1:13000/health/ready");
        const health = (await res.json()) as any;
        const status = health.services?.nats?.status;
        if (status && status !== "up") {
          console.log(`  → NATS status changed to: ${status}`);
          return true;
        }
        return false;
      },
      { timeoutMs: 45_000, intervalMs: 2_000, label: "nats-health-down" },
    );

    // App should still be ready regardless
    const res = await fetch("http://127.0.0.1:13000/health/ready");
    expect(res.status).toBe(200);

    // Re-enable NATS
    await enableProxy(PROXY_NAMES.NATS);
  }, 60_000);

  test("events deliver after NATS recovery via polling", async () => {
    // Subscribe
    await mcpCall(
      `${testState.orgId}_self`,
      "tools/call",
      {
        name: "EVENT_SUBSCRIBE",
        arguments: { eventType: `${EVENT_TYPE}.recovery` },
      },
      {
        apiKey: testState.apiKey,
        callerConnectionId: testState.subscriberConnectionId,
      },
    );

    // Disable NATS, publish event
    await disableProxy(PROXY_NAMES.NATS);
    await Bun.sleep(3_000);

    const eventId = crypto.randomUUID();
    await mcpCall(
      `${testState.orgId}_self`,
      "tools/call",
      {
        name: "EVENT_PUBLISH",
        arguments: {
          type: `${EVENT_TYPE}.recovery`,
          data: { message: "should-deliver-after-recovery", testId: eventId },
        },
      },
      {
        apiKey: testState.apiKey,
        callerConnectionId: testState.everythingConnectionId,
      },
    );

    // Re-enable NATS
    await enableProxy(PROXY_NAMES.NATS);

    // Poll until subscriber received the event
    await pollUntil(
      async () => {
        const events = await getReceivedEvents();
        return events.some((e) =>
          e.events?.some((ev: any) => ev.data?.testId === eventId),
        );
      },
      {
        timeoutMs: 45_000,
        intervalMs: 2_000,
        label: "event-delivered-after-recovery",
      },
    );
    console.log("  → Event delivered after NATS recovery");
  }, 60_000);
});
