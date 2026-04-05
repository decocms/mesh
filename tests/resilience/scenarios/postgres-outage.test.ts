import { describe, test, expect } from "bun:test";
import { registerTestHooks, testState } from "../lib/setup";
import { disableProxy, enableProxy } from "../lib/toxiproxy";
import { PROXY_NAMES } from "../lib/toxic-presets";
import { mcpCall } from "../lib/mesh-client";
import { pollUntil } from "../lib/poll-until";

registerTestHooks();

describe("Postgres outage", () => {
  test("readiness fails when DB down", async () => {
    await disableProxy(PROXY_NAMES.POSTGRES);

    // Poll until /health/ready returns non-200 (503 or fetch error)
    // When the proxy is disabled, mesh may hang briefly (HTTP 000 / connection error)
    // before recovering and returning 503
    await pollUntil(
      async () => {
        try {
          const res = await fetch("http://127.0.0.1:13000/health/ready");
          return res.status === 503;
        } catch {
          // fetch threw — mesh is unreachable, which also counts as "not ready"
          return true;
        }
      },
      {
        timeoutMs: 30_000,
        intervalMs: 2_000,
        label: "readiness-fails-on-db-down",
      },
    );
  }, 30_000);

  test("tool calls fail gracefully (not hang)", async () => {
    await disableProxy(PROXY_NAMES.POSTGRES);

    // Give pool time to detect
    await Bun.sleep(5_000);

    const start = performance.now();
    try {
      await mcpCall(
        `${testState.orgId}_self`,
        "tools/call",
        { name: "COLLECTION_CONNECTIONS_LIST", arguments: {} },
        { apiKey: testState.apiKey },
        { timeoutMs: 35_000 },
      );
      // If it succeeds (unlikely with DB down), that's fine too
    } catch (error: any) {
      const durationMs = performance.now() - start;
      // Should fail with an error, not hang for the full timeout
      expect(durationMs).toBeLessThan(35_000);
      expect(error.message).toBeTruthy();
    }
  }, 45_000);

  test("app recovers after DB returns", async () => {
    // Disable and wait for detection
    await disableProxy(PROXY_NAMES.POSTGRES);
    await pollUntil(
      async () => {
        try {
          const res = await fetch("http://127.0.0.1:13000/health/ready");
          return res.status === 503;
        } catch {
          return true;
        }
      },
      {
        timeoutMs: 30_000,
        intervalMs: 2_000,
        label: "wait-for-db-down-detection",
      },
    );

    // Re-enable Postgres
    await enableProxy(PROXY_NAMES.POSTGRES);

    // Poll until health returns 200 and tool calls succeed
    await pollUntil(
      async () => {
        try {
          const res = await fetch("http://127.0.0.1:13000/health/ready");
          if (!res.ok) return false;

          const { result } = await mcpCall(
            `${testState.orgId}_self`,
            "tools/call",
            { name: "COLLECTION_CONNECTIONS_LIST", arguments: {} },
            { apiKey: testState.apiKey },
            { timeoutMs: 10_000 },
          );
          return !!result;
        } catch {
          return false;
        }
      },
      { timeoutMs: 60_000, intervalMs: 3_000, label: "db-recovery" },
    );
  }, 120_000);
});
