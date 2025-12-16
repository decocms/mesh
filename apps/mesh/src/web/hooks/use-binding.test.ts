import type { ConnectionEntity } from "@/tools/connection/schema";
import { connectionImplementsBinding } from "@/web/hooks/use-binding";
import { MCP_BINDING } from "@decocms/bindings/mcp";
import { describe, expect, it } from "bun:test";

describe("Configuration Binding Detection", () => {
  it("should detect MCP binding when tools match", () => {
    const connection: ConnectionEntity = {
      id: "test-conn",
      title: "Test Connection",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: "user-1",
      organization_id: "org-1",
      connection_type: "HTTP",
      connection_url: "https://example.com",
      connection_token: null,
      description: null,
      icon: null,
      app_name: null,
      app_id: null,
      connection_headers: null,
      oauth_config: null,
      configuration_state: null,
      configuration_scopes: null,
      metadata: null,
      bindings: [],
      status: "active",
      tools: [
        {
          name: "MCP_CONFIGURATION",
          inputSchema: {},
          outputSchema: {},
        },
      ],
    };

    const result = connectionImplementsBinding(connection, MCP_BINDING);
    expect(result).toBe(true);
  });

  it("should not detect MCP binding when tools do not match", () => {
    const connection: ConnectionEntity = {
      id: "test-conn",
      title: "Test Connection",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: "user-1",
      organization_id: "org-1",
      connection_type: "HTTP",
      connection_url: "https://example.com",
      connection_token: null,
      description: null,
      icon: null,
      app_name: null,
      app_id: null,
      connection_headers: null,
      oauth_config: null,
      configuration_state: null,
      configuration_scopes: null,
      metadata: null,
      bindings: [],
      status: "active",
      tools: [
        {
          name: "SOME_OTHER_TOOL",
          inputSchema: {},
          outputSchema: {},
        },
      ],
    };

    const result = connectionImplementsBinding(connection, MCP_BINDING);
    expect(result).toBe(false);
  });
});
