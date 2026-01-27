import { describe, it, expect, mock, afterEach } from "bun:test";
import { handleAuthError } from "./oauth-proxy";

describe("oauth-proxy auth detection", () => {
  afterEach(() => {
    mock.restore();
  });

  it("does not claim OAuth support when origin requires a Bearer token (PAT) without MCP OAuth metadata", async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = mock(() =>
        Promise.resolve(
          new Response("bad request: missing required Authorization header", {
            status: 401,
            headers: {
              "WWW-Authenticate": "Bearer",
              "Content-Type": "text/plain",
            },
          }),
        ),
      ) as unknown as typeof fetch;

      const res = await handleAuthError({
        error: { status: 401, message: "401 Unauthorized" } as any,
        reqUrl: new URL("http://localhost:3000/mcp/conn_123"),
        connectionId: "conn_123",
        connectionUrl: "https://api.githubcopilot.com/mcp/",
        headers: {},
      });

      expect(res).toBeTruthy();
      expect(res!.status).toBe(401);
      expect(res!.headers.get("WWW-Authenticate")).toBeNull();
      const body = await res!.json();
      expect(body.error).toBe("unauthorized");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("claims OAuth support when origin returns an OAuth-style challenge", async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "invalid_token" }), {
            status: 401,
            headers: {
              "WWW-Authenticate": 'Bearer realm="OAuth", error="invalid_token"',
              "Content-Type": "application/json",
            },
          }),
        ),
      ) as unknown as typeof fetch;

      const res = await handleAuthError({
        error: { status: 401, message: "401 Unauthorized" } as any,
        reqUrl: new URL("http://localhost:3000/mcp/conn_123"),
        connectionId: "conn_123",
        connectionUrl: "https://origin.example.com/mcp",
        headers: {},
      });

      expect(res).toBeTruthy();
      expect(res!.status).toBe(401);
      expect(res!.headers.get("WWW-Authenticate") ?? "").toContain(
        "resource_metadata=",
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("claims OAuth support when origin returns 401 without WWW-Authenticate but has OAuth metadata (ClickHouse-style)", async () => {
    // ClickHouse returns 401 without WWW-Authenticate header but has OAuth metadata
    // at /.well-known/oauth-authorization-server
    const originalFetch = global.fetch;
    try {
      let callCount = 0;
      global.fetch = mock((url: string) => {
        callCount++;
        // First call: MCP endpoint returns 401 without WWW-Authenticate
        if (callCount === 1) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: "Authentication required" }), {
              status: 401,
              headers: {
                "Content-Type": "application/json",
                // No WWW-Authenticate header!
              },
            }),
          );
        }
        // Second call: OAuth metadata endpoint returns valid metadata
        if ((url as string).includes("oauth-authorization-server")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                issuer: "https://mcp.clickhouse.cloud",
                authorization_endpoint:
                  "https://mcp.clickhouse.cloud/authorize",
                token_endpoint: "https://mcp.clickhouse.cloud/token",
                registration_endpoint: "https://mcp.clickhouse.cloud/register",
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              },
            ),
          );
        }
        return Promise.resolve(new Response("Not found", { status: 404 }));
      }) as unknown as typeof fetch;

      const res = await handleAuthError({
        error: { status: 401, message: "401 Unauthorized" } as any,
        reqUrl: new URL("http://localhost:3000/mcp/conn_123"),
        connectionId: "conn_123",
        connectionUrl: "https://mcp.clickhouse.cloud/mcp",
        headers: {},
      });

      expect(res).toBeTruthy();
      expect(res!.status).toBe(401);
      // Should have WWW-Authenticate header indicating OAuth is supported
      expect(res!.headers.get("WWW-Authenticate")).toBeTruthy();
      expect(res!.headers.get("WWW-Authenticate") ?? "").toContain(
        "resource_metadata=",
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("does not claim OAuth support when origin returns 401 without WWW-Authenticate and no OAuth metadata", async () => {
    const originalFetch = global.fetch;
    try {
      let callCount = 0;
      global.fetch = mock(() => {
        callCount++;
        // First call: MCP endpoint returns 401 without WWW-Authenticate
        if (callCount === 1) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: "Unauthorized" }), {
              status: 401,
              headers: {
                "Content-Type": "application/json",
              },
            }),
          );
        }
        // Second call: No OAuth metadata
        return Promise.resolve(new Response("Not found", { status: 404 }));
      }) as unknown as typeof fetch;

      const res = await handleAuthError({
        error: { status: 401, message: "401 Unauthorized" } as any,
        reqUrl: new URL("http://localhost:3000/mcp/conn_123"),
        connectionId: "conn_123",
        connectionUrl: "https://api.example.com/mcp",
        headers: {},
      });

      expect(res).toBeTruthy();
      expect(res!.status).toBe(401);
      // Should NOT have WWW-Authenticate header
      expect(res!.headers.get("WWW-Authenticate")).toBeNull();
      const body = await res!.json();
      expect(body.error).toBe("unauthorized");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
