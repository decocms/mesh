import { describe, it, expect, mock, afterEach } from "bun:test";
import { handleAuthError } from "./oauth-proxy";

describe("oauth-proxy auth detection", () => {
  afterEach(() => {
    mock.restore();
  });

  it("does not claim OAuth support when origin requires a Bearer token (PAT) without MCP OAuth metadata", async () => {
    const originalFetch = global.fetch;
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

    global.fetch = originalFetch;

    expect(res).toBeTruthy();
    expect(res!.status).toBe(401);
    expect(res!.headers.get("WWW-Authenticate")).toBeNull();
    const body = await res!.json();
    expect(body.error).toBe("unauthorized");
  });

  it("claims OAuth support when origin returns an OAuth-style challenge", async () => {
    const originalFetch = global.fetch;
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

    global.fetch = originalFetch;

    expect(res).toBeTruthy();
    expect(res!.status).toBe(401);
    expect(res!.headers.get("WWW-Authenticate") ?? "").toContain(
      "resource_metadata=",
    );
  });
});
