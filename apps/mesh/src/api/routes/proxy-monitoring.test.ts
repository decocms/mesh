import { describe, expect, it, vi } from "bun:test";
import type { MeshContext } from "../../core/mesh-context";
import {
  createProxyMonitoringMiddleware,
  createProxyStreamableMonitoringMiddleware,
} from "./proxy-monitoring";

function createMockCtx(overrides?: {
  gatewayId?: string;
  userAgent?: string;
  properties?: Record<string, string>;
}) {
  const log = vi.fn(async (_event: unknown) => {});

  // Use defaults unless explicitly overridden (including with undefined)
  const hasGatewayOverride = overrides && "gatewayId" in overrides;
  const hasUserAgentOverride = overrides && "userAgent" in overrides;
  const hasPropertiesOverride = overrides && "properties" in overrides;

  const ctx = {
    organization: { id: "org_1" },
    auth: { user: { id: "user_1" } },
    storage: { monitoring: { log } },
    metadata: {
      requestId: "req_1",
      userAgent: hasUserAgentOverride ? overrides.userAgent : "test-client/1.0",
      properties: hasPropertiesOverride ? overrides.properties : undefined,
    },
    gatewayId: hasGatewayOverride ? overrides.gatewayId : "gw_123",
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
    // Verify new fields are logged
    expect(event.userAgent).toBe("test-client/1.0");
    expect(event.gatewayId).toBe("gw_123");
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
    // Verify new fields are logged
    expect(event.userAgent).toBe("test-client/1.0");
    expect(event.gatewayId).toBe("gw_123");
  });

  it("logs without userAgent and gatewayId when not provided", async () => {
    const { ctx, log } = createMockCtx({
      userAgent: undefined,
      gatewayId: undefined,
    });

    const middleware = createProxyMonitoringMiddleware({
      ctx,
      enabled: true,
      connectionId: "conn_1",
      connectionTitle: "Test Connection",
    });

    const request = {
      method: "tools/call",
      params: { name: "bar", arguments: {} },
    } as any;

    await middleware(request, async () => {
      return { content: [], isError: false } as any;
    });

    expect(log).toHaveBeenCalledTimes(1);
    const event = log.mock.calls.at(0)![0] as any;
    expect(event.userAgent).toBeUndefined();
    expect(event.gatewayId).toBeUndefined();
  });

  it("extracts properties from _meta.properties in arguments", async () => {
    const { ctx, log } = createMockCtx();

    const middleware = createProxyMonitoringMiddleware({
      ctx,
      enabled: true,
      connectionId: "conn_1",
      connectionTitle: "Test Connection",
    });

    const request = {
      method: "tools/call",
      params: {
        name: "test_tool",
        arguments: {
          input: "value",
          _meta: {
            properties: { thread_id: "thread_123", trace_id: "trace_456" },
          },
        },
      },
    } as any;

    await middleware(request, async () => {
      return { content: [], isError: false } as any;
    });

    expect(log).toHaveBeenCalledTimes(1);
    const event = log.mock.calls.at(0)![0] as any;
    expect(event.properties).toEqual({
      thread_id: "thread_123",
      trace_id: "trace_456",
    });
  });

  it("merges header properties with _meta.properties (header takes precedence)", async () => {
    const { ctx, log } = createMockCtx({
      properties: { thread_id: "header_thread", source: "header" },
    });

    const middleware = createProxyMonitoringMiddleware({
      ctx,
      enabled: true,
      connectionId: "conn_1",
      connectionTitle: "Test Connection",
    });

    const request = {
      method: "tools/call",
      params: {
        name: "test_tool",
        arguments: {
          _meta: {
            properties: { thread_id: "meta_thread", extra: "from_meta" },
          },
        },
      },
    } as any;

    await middleware(request, async () => {
      return { content: [], isError: false } as any;
    });

    expect(log).toHaveBeenCalledTimes(1);
    const event = log.mock.calls.at(0)![0] as any;
    // Header properties take precedence
    expect(event.properties).toEqual({
      thread_id: "header_thread", // from header (takes precedence)
      source: "header", // from header
      extra: "from_meta", // from _meta (no conflict)
    });
  });

  it("logs properties from header when no _meta.properties", async () => {
    const { ctx, log } = createMockCtx({
      properties: { env: "production", region: "us-east" },
    });

    const middleware = createProxyMonitoringMiddleware({
      ctx,
      enabled: true,
      connectionId: "conn_1",
      connectionTitle: "Test Connection",
    });

    const request = {
      method: "tools/call",
      params: { name: "test_tool", arguments: { foo: "bar" } },
    } as any;

    await middleware(request, async () => {
      return { content: [], isError: false } as any;
    });

    expect(log).toHaveBeenCalledTimes(1);
    const event = log.mock.calls.at(0)![0] as any;
    expect(event.properties).toEqual({ env: "production", region: "us-east" });
  });

  it("ignores non-string values in _meta.properties", async () => {
    const { ctx, log } = createMockCtx();

    const middleware = createProxyMonitoringMiddleware({
      ctx,
      enabled: true,
      connectionId: "conn_1",
      connectionTitle: "Test Connection",
    });

    const request = {
      method: "tools/call",
      params: {
        name: "test_tool",
        arguments: {
          _meta: {
            properties: {
              valid_string: "yes",
              invalid_number: 123,
              invalid_object: { nested: true },
              invalid_array: ["a", "b"],
            },
          },
        },
      },
    } as any;

    await middleware(request, async () => {
      return { content: [], isError: false } as any;
    });

    expect(log).toHaveBeenCalledTimes(1);
    const event = log.mock.calls.at(0)![0] as any;
    // Only string values should be included
    expect(event.properties).toEqual({ valid_string: "yes" });
  });
});
