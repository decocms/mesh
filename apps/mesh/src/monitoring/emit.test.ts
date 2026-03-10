import { describe, it, expect } from "bun:test";
import { emitMonitoringLog } from "./emit";
import type { EmitMonitoringLogParams } from "./emit";

function makeParams(
  overrides: Partial<EmitMonitoringLogParams> = {},
): EmitMonitoringLogParams {
  return {
    organizationId: "org_123",
    connectionId: "conn_456",
    connectionTitle: "My MCP Server",
    toolName: "EXAMPLE_TOOL",
    toolArguments: { query: "test" },
    result: { content: [{ type: "text", text: "ok" }] },
    duration: 150,
    isError: false,
    errorMessage: null,
    userId: "user_789",
    requestId: "req_abc",
    userAgent: "cursor/1.0",
    virtualMcpId: "vmcp_def",
    properties: { env: "prod" },
    ...overrides,
  };
}

describe("emitMonitoringLog", () => {
  it("should not throw on valid params", () => {
    expect(() => emitMonitoringLog(makeParams())).not.toThrow();
  });

  it("should not throw when organizationId is empty (skips emission)", () => {
    expect(() =>
      emitMonitoringLog(makeParams({ organizationId: "" })),
    ).not.toThrow();
  });

  it("should not throw with null optional fields", () => {
    expect(() =>
      emitMonitoringLog(
        makeParams({
          userId: null,
          userAgent: null,
          virtualMcpId: null,
          properties: null,
          errorMessage: null,
        }),
      ),
    ).not.toThrow();
  });

  it("should not throw when toolArguments is undefined", () => {
    expect(() =>
      emitMonitoringLog(makeParams({ toolArguments: undefined })),
    ).not.toThrow();
  });

  it("should not throw with error params", () => {
    expect(() =>
      emitMonitoringLog(
        makeParams({
          isError: true,
          errorMessage: "Something went wrong",
        }),
      ),
    ).not.toThrow();
  });

  it("should not throw with PII in input (redaction runs internally)", () => {
    expect(() =>
      emitMonitoringLog(
        makeParams({
          toolArguments: { email: "user@example.com", query: "test" },
          errorMessage: "Failed for user@example.com",
        }),
      ),
    ).not.toThrow();
  });

  it("should accept an optional context parameter", () => {
    // Passing undefined context should not throw
    expect(() => emitMonitoringLog(makeParams(), undefined)).not.toThrow();
  });

  it("should be fail-safe when result contains circular references", () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    // This would cause JSON.stringify to throw, but emitMonitoringLog is fail-safe
    expect(() =>
      emitMonitoringLog(makeParams({ result: circular })),
    ).not.toThrow();
  });
});
