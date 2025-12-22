import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import oauthProxyRoutes from "./oauth-proxy";
import { ContextFactory } from "../../core/context-factory";

// Mock ContextFactory
mock.module("../../core/context-factory", () => ({
  ContextFactory: {
    create: mock(() =>
      Promise.resolve({
        storage: {
          connections: {
            findById: mock(() => Promise.resolve(null)),
          },
        },
      }),
    ),
  },
}));

describe("OAuth Proxy Routes", () => {
  let app: Hono;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    app = new Hono();
    app.route("/", oauthProxyRoutes);
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    mock.restore();
  });

  describe("Protected Resource Metadata Proxy", () => {
    const mockConnectionStorage = (
      connection: {
        connection_url?: string;
      } | null,
    ) => {
      (ContextFactory.create as ReturnType<typeof mock>).mockImplementation(
        () =>
          Promise.resolve({
            storage: {
              connections: {
                findById: mock(() => Promise.resolve(connection)),
              },
            },
          }),
      );
    };

    test("returns 404 when connection not found", async () => {
      mockConnectionStorage(null);

      const res = await app.request(
        "/.well-known/oauth-protected-resource/mcp/conn_notfound",
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Connection not found");
    });

    test("proxies and rewrites protected resource metadata", async () => {
      mockConnectionStorage({
        connection_url: "https://origin.example.com/mcp",
      });

      // Mock fetch to origin server
      global.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              resource: "https://origin.example.com/mcp",
              authorization_servers: ["https://origin.example.com"],
              scopes_supported: ["*"],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
      ) as unknown as typeof fetch;

      const res = await app.request(
        "http://localhost:3000/.well-known/oauth-protected-resource/mcp/conn_123",
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      // Should rewrite resource URL to our proxy
      expect(body.resource).toBe("http://localhost:3000/mcp/conn_123");
      // Should rewrite authorization_servers to our proxy
      expect(body.authorization_servers).toEqual([
        "http://localhost:3000/oauth-proxy/conn_123",
      ]);
      // Should preserve other fields
      expect(body.scopes_supported).toEqual(["*"]);
    });

    test("works with alternative route pattern /mcp/:connectionId/.well-known/...", async () => {
      mockConnectionStorage({
        connection_url: "https://origin.example.com/mcp",
      });

      global.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              resource: "https://origin.example.com/mcp",
              authorization_servers: ["https://origin.example.com"],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
      ) as unknown as typeof fetch;

      const res = await app.request(
        "http://localhost:3000/mcp/conn_123/.well-known/oauth-protected-resource",
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.resource).toBe("http://localhost:3000/mcp/conn_123");
    });

    test("falls back to format 2 (Smithery-style) when format 1 returns 404", async () => {
      mockConnectionStorage({
        connection_url: "https://server.smithery.ai/@exa-labs/exa-code-mcp/mcp",
      });

      let fetchCallCount = 0;
      global.fetch = mock((url: string) => {
        fetchCallCount++;
        if (fetchCallCount === 1) {
          // Format 1: {resource}/.well-known/... - returns 404
          expect(url).toBe(
            "https://server.smithery.ai/@exa-labs/exa-code-mcp/mcp/.well-known/oauth-protected-resource",
          );
          return Promise.resolve(
            new Response(JSON.stringify({ error: "Not found" }), {
              status: 404,
            }),
          );
        }
        // Format 2: /.well-known/...{resource-path} - Smithery style
        expect(url).toBe(
          "https://server.smithery.ai/.well-known/oauth-protected-resource/@exa-labs/exa-code-mcp/mcp",
        );
        return Promise.resolve(
          new Response(
            JSON.stringify({
              resource: "https://server.smithery.ai/@exa-labs/exa-code-mcp/mcp",
              authorization_servers: [
                "https://auth.smithery.ai/@exa-labs/exa-code-mcp",
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }) as unknown as typeof fetch;

      const res = await app.request(
        "http://localhost:3000/.well-known/oauth-protected-resource/mcp/conn_123",
      );

      expect(res.status).toBe(200);
      expect(fetchCallCount).toBe(2);

      const body = await res.json();
      expect(body.resource).toBe("http://localhost:3000/mcp/conn_123");
      expect(body.authorization_servers).toEqual([
        "http://localhost:3000/oauth-proxy/conn_123",
      ]);
    });

    test("normalizes trailing slash in resource path (RFC 9728)", async () => {
      mockConnectionStorage({
        connection_url: "https://origin.example.com/mcp/", // Trailing slash
      });

      global.fetch = mock((url: string) => {
        // Should strip trailing slash before .well-known
        expect(url).toBe(
          "https://origin.example.com/mcp/.well-known/oauth-protected-resource",
        );
        return Promise.resolve(
          new Response(
            JSON.stringify({
              resource: "https://origin.example.com/mcp",
              authorization_servers: ["https://auth.example.com"],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }) as unknown as typeof fetch;

      const res = await app.request(
        "http://localhost:3000/.well-known/oauth-protected-resource/mcp/conn_123",
      );

      expect(res.status).toBe(200);
    });

    test("handles root path resource correctly", async () => {
      mockConnectionStorage({
        connection_url: "https://origin.example.com/", // Root path
      });

      global.fetch = mock((url: string) => {
        // Should produce /.well-known/... not //.well-known/...
        expect(url).toBe(
          "https://origin.example.com/.well-known/oauth-protected-resource",
        );
        return Promise.resolve(
          new Response(
            JSON.stringify({
              resource: "https://origin.example.com",
              authorization_servers: ["https://auth.example.com"],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }) as unknown as typeof fetch;

      const res = await app.request(
        "http://localhost:3000/.well-known/oauth-protected-resource/mcp/conn_123",
      );

      expect(res.status).toBe(200);
    });

    test("returns 502 when origin fetch fails", async () => {
      mockConnectionStorage({
        connection_url: "https://origin.example.com/mcp",
      });

      global.fetch = mock(() =>
        Promise.reject(new Error("Network error")),
      ) as unknown as typeof fetch;

      const res = await app.request(
        "/.well-known/oauth-protected-resource/mcp/conn_123",
      );

      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error).toBe("Failed to proxy OAuth metadata");
    });

    test("passes through error responses from origin", async () => {
      mockConnectionStorage({
        connection_url: "https://origin.example.com/mcp",
      });

      global.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "Not authorized" }), {
            status: 401,
            statusText: "Unauthorized",
          }),
        ),
      ) as unknown as typeof fetch;

      const res = await app.request(
        "/.well-known/oauth-protected-resource/mcp/conn_123",
      );

      expect(res.status).toBe(401);
    });
  });

  describe("Authorization Server Metadata Proxy", () => {
    const mockConnectionWithAuthServer = (
      connection: { connection_url?: string } | null,
      protectedResourceResponse?: Response,
    ) => {
      (ContextFactory.create as ReturnType<typeof mock>).mockImplementation(
        () =>
          Promise.resolve({
            storage: {
              connections: {
                findById: mock(() => Promise.resolve(connection)),
              },
            },
          }),
      );

      if (protectedResourceResponse) {
        global.fetch = mock((url: string) => {
          if (url.includes("oauth-protected-resource")) {
            return Promise.resolve(protectedResourceResponse);
          }
          // Default auth server metadata response
          return Promise.resolve(
            new Response(
              JSON.stringify({
                issuer: "https://origin.example.com",
                authorization_endpoint: "https://origin.example.com/authorize",
                token_endpoint: "https://origin.example.com/token",
                registration_endpoint: "https://origin.example.com/register",
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }) as unknown as typeof fetch;
      }
    };

    test("returns 404 when connection not found", async () => {
      mockConnectionWithAuthServer(null);

      const res = await app.request(
        "/.well-known/oauth-authorization-server/oauth-proxy/conn_notfound",
      );

      expect(res.status).toBe(404);
    });

    test("returns 404 when no auth server in protected resource metadata", async () => {
      mockConnectionWithAuthServer(
        { connection_url: "https://origin.example.com/mcp" },
        new Response(
          JSON.stringify({
            resource: "https://origin.example.com/mcp",
            authorization_servers: [], // Empty
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const res = await app.request(
        "/.well-known/oauth-authorization-server/oauth-proxy/conn_123",
      );

      expect(res.status).toBe(404);
    });

    test("proxies and rewrites authorization server metadata", async () => {
      mockConnectionWithAuthServer(
        { connection_url: "https://origin.example.com/mcp" },
        new Response(
          JSON.stringify({
            resource: "https://origin.example.com/mcp",
            authorization_servers: ["https://origin.example.com"],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const res = await app.request(
        "http://localhost:3000/.well-known/oauth-authorization-server/oauth-proxy/conn_123",
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      // Should rewrite endpoints to our proxy
      expect(body.authorization_endpoint).toBe(
        "http://localhost:3000/oauth-proxy/conn_123/authorize",
      );
      expect(body.token_endpoint).toBe(
        "http://localhost:3000/oauth-proxy/conn_123/token",
      );
      expect(body.registration_endpoint).toBe(
        "http://localhost:3000/oauth-proxy/conn_123/register",
      );
      // Should preserve issuer
      expect(body.issuer).toBe("https://origin.example.com");
    });

    test("handles root path auth server without trailing slash", async () => {
      // When auth server is at root (https://example.com), the well-known URL
      // should be /.well-known/oauth-authorization-server (no trailing slash)
      mockConnectionWithAuthServer(
        { connection_url: "https://origin.example.com/mcp" },
        new Response(
          JSON.stringify({
            resource: "https://origin.example.com/mcp",
            // Auth server at root path
            authorization_servers: ["https://auth.example.com"],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      let fetchedUrl: string | null = null;
      global.fetch = mock((url: string) => {
        if (url.includes("oauth-protected-resource")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                authorization_servers: ["https://auth.example.com"],
              }),
              { status: 200 },
            ),
          );
        }
        // Capture the auth server metadata URL
        fetchedUrl = url;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              authorization_endpoint: "https://auth.example.com/authorize",
            }),
            { status: 200 },
          ),
        );
      }) as unknown as typeof fetch;

      await app.request(
        "http://localhost:3000/.well-known/oauth-authorization-server/oauth-proxy/conn_123",
      );

      // Should NOT have trailing slash
      expect(fetchedUrl).toBeTruthy();
      expect(
        (fetchedUrl ?? "").includes(".well-known/oauth-authorization-server"),
      ).toBe(true);
      expect((fetchedUrl ?? "").endsWith("/")).toBe(false);
    });

    test("handles non-root path auth server correctly", async () => {
      mockConnectionWithAuthServer(
        { connection_url: "https://origin.example.com/mcp" },
        new Response(
          JSON.stringify({
            authorization_servers: ["https://auth.example.com/oauth"],
          }),
          { status: 200 },
        ),
      );

      let fetchedUrl: string | null = null;
      global.fetch = mock((url: string) => {
        if (url.includes("oauth-protected-resource")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                authorization_servers: ["https://auth.example.com/oauth"],
              }),
              { status: 200 },
            ),
          );
        }
        fetchedUrl = url;
        return Promise.resolve(
          new Response(JSON.stringify({}), { status: 200 }),
        );
      }) as unknown as typeof fetch;

      await app.request(
        "http://localhost:3000/.well-known/oauth-authorization-server/oauth-proxy/conn_123",
      );

      // Should append the path
      expect(fetchedUrl).toBeTruthy();
      expect(
        (fetchedUrl ?? "").includes(
          ".well-known/oauth-authorization-server/oauth",
        ),
      ).toBe(true);
    });
  });
});

describe("OAuth URL Path Construction", () => {
  test("root path results in no suffix", () => {
    const authServerUrl = new URL("https://example.com/");
    const authServerPath =
      authServerUrl.pathname === "/" ? "" : authServerUrl.pathname;
    const result = `/.well-known/oauth-authorization-server${authServerPath}`;

    expect(result).toBe("/.well-known/oauth-authorization-server");
    expect(result).not.toEndWith("/");
  });

  test("non-root path is appended correctly", () => {
    const authServerUrl = new URL("https://example.com/oauth");
    const authServerPath =
      authServerUrl.pathname === "/" ? "" : authServerUrl.pathname;
    const result = `/.well-known/oauth-authorization-server${authServerPath}`;

    expect(result).toBe("/.well-known/oauth-authorization-server/oauth");
  });

  test("deep path is appended correctly", () => {
    const authServerUrl = new URL("https://example.com/v1/oauth/server");
    const authServerPath =
      authServerUrl.pathname === "/" ? "" : authServerUrl.pathname;
    const result = `/.well-known/oauth-authorization-server${authServerPath}`;

    expect(result).toBe(
      "/.well-known/oauth-authorization-server/v1/oauth/server",
    );
  });
});
