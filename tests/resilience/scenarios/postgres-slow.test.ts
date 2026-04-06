import { describe, test, expect } from "bun:test";
import { registerTestHooks, testState } from "../lib/setup";
import { addToxic, removeToxic } from "../lib/toxiproxy";
import {
  PROXY_NAMES,
  DB_MODERATE_LATENCY,
  DB_HIGH_LATENCY,
} from "../lib/toxic-presets";
import { mcpCall, healthCheck } from "../lib/mesh-client";
import { pollUntil } from "../lib/poll-until";

registerTestHooks();

describe("Postgres slowdown", () => {
  test("tool calls succeed with moderate DB latency (5s)", async () => {
    await addToxic(PROXY_NAMES.POSTGRES, DB_MODERATE_LATENCY);

    // A single MCP tool call may issue multiple DB queries (auth, permission, tool logic).
    // With 5s latency per TCP segment, total time can be 30-60s+.
    const start = performance.now();
    const { result, durationMs } = await mcpCall(
      `${testState.orgId}_self`,
      "tools/call",
      { name: "COLLECTION_CONNECTIONS_LIST", arguments: {} },
      { apiKey: testState.apiKey },
      { timeoutMs: 120_000 },
    );

    expect(result).toBeTruthy();
    expect(durationMs).toBeGreaterThanOrEqual(4_000);
    console.log(
      `  → Moderate DB latency: tool call completed in ${Math.round(durationMs)}ms`,
    );
  }, 150_000);

  test("health endpoint behavior with high DB latency (15s)", async () => {
    await addToxic(PROXY_NAMES.POSTGRES, DB_HIGH_LATENCY);

    // Health check runs SELECT 1 which will be delayed by 15s per segment
    const start = performance.now();
    try {
      const res = await fetch("http://127.0.0.1:13000/health/ready", {
        signal: AbortSignal.timeout(60_000),
      });
      const durationMs = performance.now() - start;

      if (res.ok) {
        expect(durationMs).toBeGreaterThanOrEqual(14_000);
        console.log(
          `  → High DB latency: health check succeeded in ${Math.round(durationMs)}ms`,
        );
      } else {
        console.log(
          `  → High DB latency: health check returned ${res.status} in ${Math.round(durationMs)}ms`,
        );
      }
    } catch (error: any) {
      const durationMs = performance.now() - start;
      console.log(
        `  → High DB latency: health check failed in ${Math.round(durationMs)}ms: ${error.name}`,
      );
    }
  }, 90_000);

  test("recovery after latency removed", async () => {
    // First add latency to slow things down
    await addToxic(PROXY_NAMES.POSTGRES, DB_MODERATE_LATENCY);

    // Verify it's slow
    const { durationMs: slowDuration } = await mcpCall(
      `${testState.orgId}_self`,
      "tools/call",
      { name: "COLLECTION_CONNECTIONS_LIST", arguments: {} },
      { apiKey: testState.apiKey },
      { timeoutMs: 120_000 },
    );
    expect(slowDuration).toBeGreaterThanOrEqual(4_000);
    console.log(`  → Slow call took ${Math.round(slowDuration)}ms`);

    // Remove the toxic
    await removeToxic(PROXY_NAMES.POSTGRES, DB_MODERATE_LATENCY.name);

    // Poll until tool calls are fast again
    await pollUntil(
      async () => {
        try {
          const { durationMs } = await mcpCall(
            `${testState.orgId}_self`,
            "tools/call",
            { name: "COLLECTION_CONNECTIONS_LIST", arguments: {} },
            { apiKey: testState.apiKey },
            { timeoutMs: 15_000 },
          );
          return durationMs < 3_000;
        } catch {
          return false;
        }
      },
      { timeoutMs: 30_000, intervalMs: 3_000, label: "db-latency-recovery" },
    );
    console.log("  → Recovery successful");
  }, 180_000);
});
