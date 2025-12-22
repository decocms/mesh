import { describe, expect, test, mock, beforeEach } from "bun:test";
import { isConnectionAuthenticated } from "./mcp-oauth";

describe("isConnectionAuthenticated", () => {
  beforeEach(() => {
    // Clear all mocks before each test
    mock.restore();
  });

  test("POSTs initialize and returns true when response is OK", async () => {
    global.fetch = mock(() =>
      Promise.resolve({
        status: 200,
        ok: true,
        headers: new Headers(),
      } as Response),
    ) as unknown as typeof fetch;

    const result = await isConnectionAuthenticated({
      url: "https://example.com/mcp",
      token: null,
    });

    expect(result).toBe(true);

    const calls = (global.fetch as unknown as ReturnType<typeof mock>).mock
      .calls;
    expect(calls.length).toBe(1);
    const [calledUrl, init] = calls[0] as [string, RequestInit];
    expect(calledUrl).toBe("https://example.com/mcp");
    expect(init.method).toBe("POST");
    expect(typeof init.body).toBe("string");
    expect(String(init.body)).toContain('"method":"initialize"');
    const headers = init.headers as Headers;
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Accept")).toBe("application/json, text/event-stream");
  });

  test("includes Authorization header when token is provided", async () => {
    global.fetch = mock(() =>
      Promise.resolve({
        status: 200,
        ok: true,
        headers: new Headers(),
      } as Response),
    ) as unknown as typeof fetch;

    const result = await isConnectionAuthenticated({
      url: "https://example.com/mcp",
      token: "valid-token",
    });

    expect(result).toBe(true);

    const calls = (global.fetch as unknown as ReturnType<typeof mock>).mock
      .calls;
    const [, init] = calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer valid-token");
  });

  test("returns false when response is not OK (401)", async () => {
    global.fetch = mock(() =>
      Promise.resolve({
        status: 401,
        ok: false,
        headers: new Headers(),
      } as Response),
    ) as unknown as typeof fetch;

    const result = await isConnectionAuthenticated({
      url: "https://example.com/mcp",
      token: "invalid-token",
    });

    expect(result).toBe(false);
  });

  describe("edge cases and error handling", () => {
    test("returns false when fetch throws network error", async () => {
      global.fetch = mock(() =>
        Promise.reject(new Error("Network error")),
      ) as unknown as typeof fetch;

      const result = await isConnectionAuthenticated({
        url: "https://example.com",
        token: "some-token",
      });

      expect(result).toBe(false);
    });

    test("returns false when fetch throws non-Error", async () => {
      global.fetch = mock(() =>
        Promise.reject("string error"),
      ) as unknown as typeof fetch;

      const result = await isConnectionAuthenticated({
        url: "https://example.com",
        token: null,
      });

      expect(result).toBe(false);
    });
  });

  describe("empty token vs null token", () => {
    test("treats empty string token as no token", async () => {
      global.fetch = mock(() =>
        Promise.resolve({
          status: 200,
          ok: true,
          headers: new Headers(),
        } as Response),
      ) as unknown as typeof fetch;

      const result = await isConnectionAuthenticated({
        url: "https://example.com/mcp",
        token: "",
      });

      expect(result).toBe(true);

      const calls = (global.fetch as unknown as ReturnType<typeof mock>).mock
        .calls;
      const [, init] = calls[0] as [string, RequestInit];
      const headers = init.headers as Headers;
      expect(headers.get("Authorization")).toBe(null);
    });
  });
});
