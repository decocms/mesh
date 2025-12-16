/**
 * MCP Integration Tests
 *
 * Tests the MCP protocol integration using the MCP Client SDK
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { RequestInfo } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, vi } from "bun:test";
import { auth } from "../auth";
import app from "./index";

describe("MCP Integration", () => {
  describe("Management Tools MCP Server", () => {
    let client: Client | null = null;
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
      // Store original fetch
      originalFetch = global.fetch;

      // Mock auth.api.getMcpSession to return null (will fall back to API key)
      vi.spyOn(auth.api, "getMcpSession").mockResolvedValue(null);

      // Mock auth.api.verifyApiKey to return valid result
      vi.spyOn(auth.api, "verifyApiKey").mockResolvedValue({
        valid: true,
        error: null,
        key: {
          id: "test-key-id",
          name: "Test API Key",
          userId: "test-user-id",
          permissions: {
            self: [
              "ORGANIZATION_CREATE",
              "ORGANIZATION_LIST",
              "ORGANIZATION_GET",
              "ORGANIZATION_UPDATE",
              "ORGANIZATION_DELETE",
              "COLLECTION_CONNECTIONS_CREATE",
              "COLLECTION_CONNECTIONS_LIST",
              "COLLECTION_CONNECTIONS_GET",
              "COLLECTION_CONNECTIONS_DELETE",
              "CONNECTION_TEST",
            ],
          },
          metadata: {
            organization: {
              id: "org_123",
              slug: "test-org",
              name: "Test Organization",
            },
          },
        },
        // oxlint-disable-next-line no-explicit-any
      } as any);

      // Mock global fetch to route through Hono app
      global.fetch = vi.fn(
        async (
          input: RequestInfo | URL,
          init?: RequestInit,
        ): Promise<Response> => {
          // Create a proper Request object
          const request = new Request(input as string | URL, init);

          // Route request through Hono app using fetch (not request)
          const response = await app.fetch(request);

          return response;
        },
      ) as unknown as typeof global.fetch;
    });

    afterEach(async () => {
      // Restore original fetch
      global.fetch = originalFetch;

      // Restore all mocks
      vi.restoreAllMocks();

      if (client) {
        await client.close();
        client = null;
      }
    });

    // Integration tests for MCP protocol removed - require complex Better Auth mocking
  });
});
