import { describe, it, expect } from "bun:test";
import {
  MESH_ATTR,
  MONITORING_SPAN_NAME,
  DEFAULT_MONITORING_URI,
  MONITORING_LOG_ATTR,
  MONITORING_LOG_TYPE_VALUE,
  spanToMonitoringRow,
  logRecordToMonitoringRow,
  type LogRecordInput,
} from "./schema";

describe("monitoring schema", () => {
  it("should define all mesh attribute key constants", () => {
    expect(MESH_ATTR.ORGANIZATION_ID).toBe("mesh.organization.id");
    expect(MESH_ATTR.CONNECTION_ID).toBe("mesh.connection.id");
    expect(MESH_ATTR.CONNECTION_TITLE).toBe("mesh.connection.title");
    expect(MESH_ATTR.TOOL_NAME).toBe("mesh.tool.name");
    expect(MESH_ATTR.TOOL_INPUT).toBe("mesh.tool.input");
    expect(MESH_ATTR.TOOL_OUTPUT).toBe("mesh.tool.output");
    expect(MESH_ATTR.TOOL_IS_ERROR).toBe("mesh.tool.is_error");
    expect(MESH_ATTR.TOOL_ERROR_MESSAGE).toBe("mesh.tool.error_message");
    expect(MESH_ATTR.TOOL_DURATION_MS).toBe("mesh.tool.duration_ms");
    expect(MESH_ATTR.USER_ID).toBe("mesh.user.id");
    expect(MESH_ATTR.REQUEST_ID).toBe("mesh.request.id");
    expect(MESH_ATTR.USER_AGENT).toBe("mesh.user_agent");
    expect(MESH_ATTR.VIRTUAL_MCP_ID).toBe("mesh.virtual_mcp.id");
    expect(MESH_ATTR.TOOL_PROPERTIES).toBe("mesh.tool.properties");
  });

  it("should define shared constants", () => {
    expect(MONITORING_SPAN_NAME).toBe("mcp.proxy.callTool");
    expect(DEFAULT_MONITORING_URI).toContain("deco");
    expect(DEFAULT_MONITORING_URI).toContain("monitoring");
  });

  it("should convert a span-like object to a monitoring row", () => {
    const attrs: Record<string, string | number | boolean> = {
      [MESH_ATTR.ORGANIZATION_ID]: "org_123",
      [MESH_ATTR.CONNECTION_ID]: "conn_456",
      [MESH_ATTR.CONNECTION_TITLE]: "My MCP Server",
      [MESH_ATTR.TOOL_NAME]: "EXAMPLE_TOOL",
      [MESH_ATTR.TOOL_INPUT]: '{"query": "test"}',
      [MESH_ATTR.TOOL_OUTPUT]: '{"result": "ok"}',
      [MESH_ATTR.TOOL_IS_ERROR]: false,
      [MESH_ATTR.TOOL_ERROR_MESSAGE]: "",
      [MESH_ATTR.TOOL_DURATION_MS]: 150,
      [MESH_ATTR.USER_ID]: "user_789",
      [MESH_ATTR.REQUEST_ID]: "req_abc",
      [MESH_ATTR.USER_AGENT]: "cursor/1.0",
      [MESH_ATTR.VIRTUAL_MCP_ID]: "vmcp_def",
      [MESH_ATTR.TOOL_PROPERTIES]: '{"env": "prod"}',
    };

    const row = spanToMonitoringRow({
      spanId: "span_001",
      startTimeUnixNano: 1709683200000000000n,
      attributes: attrs,
    });

    expect(row.id).toBe("span_001");
    expect(row.organization_id).toBe("org_123");
    expect(row.connection_id).toBe("conn_456");
    expect(row.tool_name).toBe("EXAMPLE_TOOL");
    expect(row.is_error).toBe(0);
    expect(row.duration_ms).toBe(150);
    expect(typeof row.timestamp).toBe("string");
    // Verify it's a valid ISO string
    expect(new Date(row.timestamp).toISOString()).toBe(row.timestamp);
  });

  it("should handle missing optional fields as null", () => {
    const attrs: Record<string, string | number | boolean> = {
      [MESH_ATTR.ORGANIZATION_ID]: "org_123",
      [MESH_ATTR.CONNECTION_ID]: "conn_456",
      [MESH_ATTR.CONNECTION_TITLE]: "Server",
      [MESH_ATTR.TOOL_NAME]: "TOOL",
      [MESH_ATTR.TOOL_INPUT]: "{}",
      [MESH_ATTR.TOOL_OUTPUT]: "{}",
      [MESH_ATTR.TOOL_IS_ERROR]: false,
      [MESH_ATTR.TOOL_DURATION_MS]: 0,
      [MESH_ATTR.REQUEST_ID]: "req_1",
    };

    const row = spanToMonitoringRow({
      spanId: "span_002",
      startTimeUnixNano: 1709683200000000000n,
      attributes: attrs,
    });

    expect(row.user_id).toBeNull();
    expect(row.user_agent).toBeNull();
    expect(row.virtual_mcp_id).toBeNull();
    expect(row.properties).toBeNull();
    expect(row.error_message).toBeNull();
  });
});

describe("logRecordToMonitoringRow", () => {
  function makeLogRecord(
    attrOverrides: Record<string, string | number | boolean | undefined> = {},
  ): LogRecordInput {
    const now = BigInt(Date.now()) * 1_000_000n;
    return {
      id: "log_test_123",
      timestampNano: now,
      attributes: {
        [MONITORING_LOG_ATTR.ORGANIZATION_ID]: "org_test",
        [MONITORING_LOG_ATTR.CONNECTION_ID]: "conn_test",
        [MONITORING_LOG_ATTR.CONNECTION_TITLE]: "Test Server",
        [MONITORING_LOG_ATTR.TOOL_NAME]: "TEST_TOOL",
        [MONITORING_LOG_ATTR.INPUT]: '{"key":"value"}',
        [MONITORING_LOG_ATTR.OUTPUT]: '{"result":"ok"}',
        [MONITORING_LOG_ATTR.IS_ERROR]: false,
        [MONITORING_LOG_ATTR.ERROR_MESSAGE]: "",
        [MONITORING_LOG_ATTR.DURATION_MS]: 100,
        [MONITORING_LOG_ATTR.USER_ID]: "user_1",
        [MONITORING_LOG_ATTR.REQUEST_ID]: "req_test",
        [MONITORING_LOG_ATTR.USER_AGENT]: "cursor/1.0",
        [MONITORING_LOG_ATTR.VIRTUAL_MCP_ID]: "vmcp_1",
        [MONITORING_LOG_ATTR.PROPERTIES]: '{"env":"prod"}',
        ...attrOverrides,
      },
    };
  }

  it("should define MONITORING_LOG_ATTR constants", () => {
    expect(MONITORING_LOG_ATTR.TYPE).toBe("mesh.monitoring.type");
    expect(MONITORING_LOG_ATTR.ORGANIZATION_ID).toBe(
      "mesh.monitoring.organization_id",
    );
    expect(MONITORING_LOG_ATTR.TOOL_NAME).toBe("mesh.monitoring.tool_name");
    expect(MONITORING_LOG_TYPE_VALUE).toBe("tool_call");
  });

  it("should populate all fields correctly", () => {
    const record = makeLogRecord();
    const row = logRecordToMonitoringRow(record);

    expect(row.id).toBe("log_test_123");
    expect(row.organization_id).toBe("org_test");
    expect(row.connection_id).toBe("conn_test");
    expect(row.connection_title).toBe("Test Server");
    expect(row.tool_name).toBe("TEST_TOOL");
    expect(row.input).toBe('{"key":"value"}');
    expect(row.output).toBe('{"result":"ok"}');
    expect(row.is_error).toBe(0);
    expect(row.error_message).toBeNull();
    expect(row.duration_ms).toBe(100);
    expect(row.user_id).toBe("user_1");
    expect(row.request_id).toBe("req_test");
    expect(row.user_agent).toBe("cursor/1.0");
    expect(row.virtual_mcp_id).toBe("vmcp_1");
    expect(row.properties).toBe('{"env":"prod"}');
    // timestamp should be a valid ISO string
    expect(row.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it("should return null for nullable fields when empty string", () => {
    const record = makeLogRecord({
      [MONITORING_LOG_ATTR.ERROR_MESSAGE]: "",
      [MONITORING_LOG_ATTR.USER_ID]: "",
      [MONITORING_LOG_ATTR.USER_AGENT]: "",
      [MONITORING_LOG_ATTR.VIRTUAL_MCP_ID]: "",
      [MONITORING_LOG_ATTR.PROPERTIES]: "",
    });
    const row = logRecordToMonitoringRow(record);

    expect(row.error_message).toBeNull();
    expect(row.user_id).toBeNull();
    expect(row.user_agent).toBeNull();
    expect(row.virtual_mcp_id).toBeNull();
    expect(row.properties).toBeNull();
  });

  it("should return values for nullable fields when present", () => {
    const record = makeLogRecord({
      [MONITORING_LOG_ATTR.ERROR_MESSAGE]: "Something broke",
      [MONITORING_LOG_ATTR.USER_ID]: "user_42",
      [MONITORING_LOG_ATTR.USER_AGENT]: "vscode/2.0",
      [MONITORING_LOG_ATTR.VIRTUAL_MCP_ID]: "vmcp_99",
      [MONITORING_LOG_ATTR.PROPERTIES]: '{"key":"val"}',
    });
    const row = logRecordToMonitoringRow(record);

    expect(row.error_message).toBe("Something broke");
    expect(row.user_id).toBe("user_42");
    expect(row.user_agent).toBe("vscode/2.0");
    expect(row.virtual_mcp_id).toBe("vmcp_99");
    expect(row.properties).toBe('{"key":"val"}');
  });

  it("should default to empty strings and 0 for missing attributes", () => {
    const record: LogRecordInput = {
      id: "log_empty",
      timestampNano: BigInt(Date.now()) * 1_000_000n,
      attributes: {},
    };
    const row = logRecordToMonitoringRow(record);

    expect(row.id).toBe("log_empty");
    expect(row.organization_id).toBe("");
    expect(row.connection_id).toBe("");
    expect(row.connection_title).toBe("");
    expect(row.tool_name).toBe("");
    expect(row.input).toBe("");
    expect(row.output).toBe("");
    expect(row.is_error).toBe(0);
    expect(row.error_message).toBeNull();
    expect(row.duration_ms).toBe(0);
    expect(row.user_id).toBeNull();
    expect(row.request_id).toBe("");
    expect(row.user_agent).toBeNull();
    expect(row.virtual_mcp_id).toBeNull();
    expect(row.properties).toBeNull();
  });

  it("should convert is_error boolean true to 1", () => {
    const row = logRecordToMonitoringRow(
      makeLogRecord({ [MONITORING_LOG_ATTR.IS_ERROR]: true }),
    );
    expect(row.is_error).toBe(1);
  });

  it("should convert is_error boolean false to 0", () => {
    const row = logRecordToMonitoringRow(
      makeLogRecord({ [MONITORING_LOG_ATTR.IS_ERROR]: false }),
    );
    expect(row.is_error).toBe(0);
  });

  it('should convert is_error string "true" to 1', () => {
    const row = logRecordToMonitoringRow(
      makeLogRecord({ [MONITORING_LOG_ATTR.IS_ERROR]: "true" }),
    );
    expect(row.is_error).toBe(1);
  });

  it("should convert is_error number 1 to 1", () => {
    const row = logRecordToMonitoringRow(
      makeLogRecord({ [MONITORING_LOG_ATTR.IS_ERROR]: 1 }),
    );
    expect(row.is_error).toBe(1);
  });

  it("should convert is_error number 0 to 0", () => {
    const row = logRecordToMonitoringRow(
      makeLogRecord({ [MONITORING_LOG_ATTR.IS_ERROR]: 0 }),
    );
    expect(row.is_error).toBe(0);
  });

  it("should handle duration_ms as string (type coercion)", () => {
    const row = logRecordToMonitoringRow(
      makeLogRecord({
        [MONITORING_LOG_ATTR.DURATION_MS]: "250" as unknown as number,
      }),
    );
    expect(row.duration_ms).toBe(250);
  });

  it("should handle duration_ms as number", () => {
    const row = logRecordToMonitoringRow(
      makeLogRecord({ [MONITORING_LOG_ATTR.DURATION_MS]: 500 }),
    );
    expect(row.duration_ms).toBe(500);
  });

  it("should default duration_ms to 0 for non-numeric string", () => {
    const row = logRecordToMonitoringRow(
      makeLogRecord({
        [MONITORING_LOG_ATTR.DURATION_MS]: "not-a-number" as unknown as number,
      }),
    );
    expect(row.duration_ms).toBe(0);
  });

  it("should convert timestamp from nanoseconds correctly", () => {
    // Use a known timestamp: 2024-03-06T00:00:00.000Z = 1709683200000 ms
    const timestampMs = 1709683200000;
    const timestampNano = BigInt(timestampMs) * 1_000_000n;
    const record = makeLogRecord();
    record.timestampNano = timestampNano;

    const row = logRecordToMonitoringRow(record);
    expect(row.timestamp).toBe(new Date(timestampMs).toISOString());
  });

  it("should use the record id as row id", () => {
    const record = makeLogRecord();
    record.id = "custom_id_abc";

    const row = logRecordToMonitoringRow(record);
    expect(row.id).toBe("custom_id_abc");
  });
});
