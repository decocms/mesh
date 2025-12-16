import { describe, expect, it, vi } from "bun:test";
import type { MeshContext } from "../../core/mesh-context";
import {
  createProxyMonitoringMiddleware,
  createProxyStreamableMonitoringMiddleware,
} from "./proxy-monitoring";

function createMockCtx() {
  const log = vi.fn(async (_event: unknown) => {});

  const ctx = {
    organization: { id: "org_1" },
    auth: { user: { id: "user_1" } },
    storage: { monitoring: { log } },
    metadata: { requestId: "req_1" },
  } as unknown as MeshContext;

  return { ctx, log };
}

describe("proxy monitoring middleware", () => {
  it("logs auth-denied CallToolResult (isError=true) even if auth returns early", async () => {
    const { ctx, log } = createMockCtx();

    const middleware = createProxyMonitoringMiddleware({
      ctx,
      enabled: true,
      connectionId: "conn_1",
      connectionTitle: "Test Connection",
    });

    const request = {
      method: "tools/call",
      params: { name: "foo", arguments: { a: 1 } },
    } as any;

    const result = await middleware(request, async () => {
      return {
        structuredContent: { reason: "nope" },
        content: [{ type: "text", text: "Authorization failed: nope" }],
        isError: true,
      } as any;
    });

    expect(result.isError).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);

    const call = log.mock.calls.at(0);
    expect(call).toBeDefined();
    const event = call![0] as any;
    expect(event.toolName).toBe("foo");
    expect(event.connectionId).toBe("conn_1");
    expect(event.isError).toBe(true);
    expect(event.errorMessage).toContain("Authorization failed");
    expect(event.input).toEqual({ a: 1 });
    // If structuredContent is present, we only store that to avoid duplication.
    expect(event.output).toEqual({ reason: "nope" });
  });

  it("logs auth-denied streamable Response (403) without consuming the body", async () => {
    const { ctx, log } = createMockCtx();

    const middleware = createProxyStreamableMonitoringMiddleware({
      ctx,
      enabled: true,
      connectionId: "conn_1",
      connectionTitle: "Test Connection",
    });

    const request = {
      method: "tools/call",
      params: { name: "foo", arguments: { a: 1 } },
    } as any;

    const response = await middleware(request, async () => {
      return new Response(
        JSON.stringify({
          structuredContent: { error: "nope" },
          // Simulate the common duplication pattern (structured + text).
          content: [{ type: "text", text: "Authorization failed: nope" }],
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    expect(response.status).toBe(403);
    // Caller can still read the body (clone/tee should not consume it).
    expect(await response.json()).toEqual({
      structuredContent: { error: "nope" },
      content: [{ type: "text", text: "Authorization failed: nope" }],
    });

    // Logging happens after the stream finishes (async).
    await new Promise((r) => setTimeout(r, 0));
    expect(log).toHaveBeenCalledTimes(1);

    const call = log.mock.calls.at(0);
    expect(call).toBeDefined();
    const event = call![0] as any;
    expect(event.toolName).toBe("foo");
    expect(event.isError).toBe(true);
    // If structuredContent is present, we only store that to avoid duplication.
    expect(event.output).toEqual({ error: "nope" });
  });
});
