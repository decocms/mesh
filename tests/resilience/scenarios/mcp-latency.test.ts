import { describe, test, expect } from "bun:test";
import { registerTestHooks, testState } from "../lib/setup";
import { addToxic, removeToxic } from "../lib/toxiproxy";
import {
  PROXY_NAMES,
  MODERATE_LATENCY,
  EXTREME_LATENCY,
  CONNECTION_HANG,
} from "../lib/toxic-presets";
import { mcpCall } from "../lib/studio-client";
import { pollUntil } from "../lib/poll-until";

registerTestHooks();

describe("MCP server latency", () => {
  test("tool call succeeds with moderate latency (10s)", async () => {
    // Add 10s latency toxic to everything proxy
    await addToxic(PROXY_NAMES.EVERYTHING, MODERATE_LATENCY);

    // Call echo tool through studio — allow enough time for the latency
    const { result, durationMs } = await mcpCall(
      testState.everythingConnectionId,
      "tools/call",
      { name: "echo", arguments: { message: "latency-test" } },
      { apiKey: testState.apiKey },
      { timeoutMs: 60_000 },
    );

    // Response received, duration proves toxic was active
    expect(result).toBeTruthy();
    expect(result.content?.[0]?.text).toContain("latency-test");
    expect(durationMs).toBeGreaterThanOrEqual(9_000);
    console.log(
      `  → Moderate latency call completed in ${Math.round(durationMs)}ms`,
    );
  }, 90_000);

  test("tool call times out with extreme latency (120s)", async () => {
    // Add 120s latency toxic
    await addToxic(PROXY_NAMES.EVERYTHING, EXTREME_LATENCY);

    // Call with a 30s client timeout — should abort before the 120s latency completes
    const start = performance.now();
    try {
      await mcpCall(
        testState.everythingConnectionId,
        "tools/call",
        { name: "echo", arguments: { message: "extreme-latency" } },
        { apiKey: testState.apiKey },
        { timeoutMs: 30_000 },
      );
      // If it somehow succeeds, that's unexpected with 120s latency and 30s timeout
      throw new Error("Expected timeout but call succeeded");
    } catch (error: any) {
      if (error.message?.includes("Expected timeout but call succeeded")) {
        throw error;
      }
      const durationMs = performance.now() - start;
      console.log(
        `  → Extreme latency call aborted in ${Math.round(durationMs)}ms: ${error.name || error.message}`,
      );
      // Should have timed out around 30s, not hung forever
      expect(durationMs).toBeLessThan(45_000);
      expect(durationMs).toBeGreaterThanOrEqual(25_000);
    }
  }, 60_000);

  test("connection hang — tool call fails cleanly", async () => {
    // Add timeout toxic: connection hangs for 5s then drops
    await addToxic(PROXY_NAMES.EVERYTHING, CONNECTION_HANG);

    const start = performance.now();
    try {
      await mcpCall(
        testState.everythingConnectionId,
        "tools/call",
        { name: "echo", arguments: { message: "hang-test" } },
        { apiKey: testState.apiKey },
        { timeoutMs: 30_000 },
      );
      // If it succeeds, the toxic didn't work as expected
      throw new Error(
        "Expected failure but call succeeded despite connection hang toxic",
      );
    } catch (error: any) {
      // Rethrow our own assertion error — the call should not have succeeded
      if (error.message?.includes("Expected failure but call succeeded")) {
        throw error;
      }
      const durationMs = performance.now() - start;
      console.log(
        `  → Connection hang: failed in ${Math.round(durationMs)}ms: ${error.message.slice(0, 100)}`,
      );
      // Should fail, not hang indefinitely
      expect(durationMs).toBeLessThan(60_000);
    }
  }, 90_000);

  test("recovery after toxic removed", async () => {
    // Make sure connection hang toxic is active
    try {
      await addToxic(PROXY_NAMES.EVERYTHING, CONNECTION_HANG);
    } catch {
      // May already be active
    }

    // Confirm it's broken
    try {
      await mcpCall(
        testState.everythingConnectionId,
        "tools/call",
        { name: "echo", arguments: { message: "pre-recovery" } },
        { apiKey: testState.apiKey },
        { timeoutMs: 15_000 },
      );
    } catch {
      // Expected to fail
    }

    // Remove the toxic
    await removeToxic(PROXY_NAMES.EVERYTHING, CONNECTION_HANG.name);

    // Poll until calls succeed again
    await pollUntil(
      async () => {
        try {
          const { result } = await mcpCall(
            testState.everythingConnectionId,
            "tools/call",
            { name: "echo", arguments: { message: "recovery-probe" } },
            { apiKey: testState.apiKey },
            { timeoutMs: 15_000 },
          );
          return !!result?.content?.[0]?.text;
        } catch {
          return false;
        }
      },
      {
        timeoutMs: 60_000,
        intervalMs: 3_000,
        label: "recovery-after-hang",
      },
    );
    console.log("  → Recovery successful");
  }, 90_000);
});
