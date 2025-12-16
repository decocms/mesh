import { describe, expect, test, mock, beforeEach } from "bun:test";
import { isConnectionAuthenticated } from "./browser-oauth-provider";

describe("isConnectionAuthenticated", () => {
  beforeEach(() => {
    // Clear all mocks before each test
    mock.restore();
  });

  describe("server does not support OAuth", () => {
    test("returns true when server returns 404", async () => {
      global.fetch = mock(() =>
        Promise.resolve({
          status: 404,
          ok: false,
          headers: new Headers(),
        } as Response),
      ) as unknown as typeof fetch;

      const result = await isConnectionAuthenticated({
        url: "https://example.com",
        token: null,
      });

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        "https://example.com/.well-known/oauth-protected-resource",
        {
          method: "GET",
          headers: { Accept: "application/json" },
        },
      );
    });

    test("returns true when server returns non-JSON content", async () => {
      const headers = new Headers();
      headers.set("content-type", "text/html");

      global.fetch = mock(() =>
        Promise.resolve({
          status: 200,
          ok: true,
          headers,
        } as Response),
      ) as unknown as typeof fetch;

      const result = await isConnectionAuthenticated({
        url: "https://example.com",
        token: null,
      });

      expect(result).toBe(true);
    });

    test("returns true when server returns no content-type header", async () => {
      global.fetch = mock(() =>
        Promise.resolve({
          status: 200,
          ok: true,
          headers: new Headers(),
        } as Response),
      ) as unknown as typeof fetch;

      const result = await isConnectionAuthenticated({
        url: "https://example.com",
        token: null,
      });

      expect(result).toBe(true);
    });
  });

  describe("server supports OAuth but token not provided", () => {
    test("returns false when OAuth is required but no token provided", async () => {
      const headers = new Headers();
      headers.set("content-type", "application/json");

      global.fetch = mock(() =>
        Promise.resolve({
          status: 200,
          ok: true,
          headers,
        } as Response),
      ) as unknown as typeof fetch;

      const result = await isConnectionAuthenticated({
        url: "https://example.com",
        token: null,
      });

      expect(result).toBe(false);
    });
  });

  describe("server supports OAuth and token provided", () => {
    test("returns false when token is invalid (401)", async () => {
      const headers = new Headers();
      headers.set("content-type", "application/json");

      global.fetch = mock(() =>
        Promise.resolve({
          status: 401,
          ok: false,
          headers,
        } as Response),
      ) as unknown as typeof fetch;

      const result = await isConnectionAuthenticated({
        url: "https://example.com",
        token: "invalid-token",
      });

      expect(result).toBe(false);
      expect(fetch).toHaveBeenCalledWith(
        "https://example.com/.well-known/oauth-protected-resource",
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: "Bearer invalid-token",
          },
        },
      );
    });

    test("returns false when token is forbidden (403)", async () => {
      const headers = new Headers();
      headers.set("content-type", "application/json");

      global.fetch = mock(() =>
        Promise.resolve({
          status: 403,
          ok: false,
          headers,
        } as Response),
      ) as unknown as typeof fetch;

      const result = await isConnectionAuthenticated({
        url: "https://example.com",
        token: "forbidden-token",
      });

      expect(result).toBe(false);
    });

    test("returns true when token is valid (200)", async () => {
      const headers = new Headers();
      headers.set("content-type", "application/json");

      global.fetch = mock(() =>
        Promise.resolve({
          status: 200,
          ok: true,
          headers,
        } as Response),
      ) as unknown as typeof fetch;

      const result = await isConnectionAuthenticated({
        url: "https://example.com",
        token: "valid-token",
      });

      expect(result).toBe(true);
    });

    test("returns false for other non-OK status codes", async () => {
      const headers = new Headers();
      headers.set("content-type", "application/json");

      global.fetch = mock(() =>
        Promise.resolve({
          status: 500,
          ok: false,
          headers,
        } as Response),
      ) as unknown as typeof fetch;

      const result = await isConnectionAuthenticated({
        url: "https://example.com",
        token: "some-token",
      });

      expect(result).toBe(false);
    });
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

    test("handles content-type with charset", async () => {
      const headers = new Headers();
      headers.set("content-type", "application/json; charset=utf-8");

      global.fetch = mock(() =>
        Promise.resolve({
          status: 200,
          ok: true,
          headers,
        } as Response),
      ) as unknown as typeof fetch;

      const result = await isConnectionAuthenticated({
        url: "https://example.com",
        token: "valid-token",
      });

      expect(result).toBe(true);
    });

    test("constructs correct URL with trailing slash", async () => {
      const headers = new Headers();
      headers.set("content-type", "application/json");

      global.fetch = mock(() =>
        Promise.resolve({
          status: 200,
          ok: true,
          headers,
        } as Response),
      ) as unknown as typeof fetch;

      await isConnectionAuthenticated({
        url: "https://example.com/",
        token: "token",
      });

      expect(fetch).toHaveBeenCalledWith(
        "https://example.com/.well-known/oauth-protected-resource",
        expect.any(Object),
      );
    });

    test("handles localhost URLs", async () => {
      const headers = new Headers();
      headers.set("content-type", "application/json");

      global.fetch = mock(() =>
        Promise.resolve({
          status: 200,
          ok: true,
          headers,
        } as Response),
      ) as unknown as typeof fetch;

      await isConnectionAuthenticated({
        url: "http://localhost:3000",
        token: "token",
      });

      expect(fetch).toHaveBeenCalledWith(
        "http://localhost:3000/.well-known/oauth-protected-resource",
        expect.any(Object),
      );
    });

    test("handles URLs with paths", async () => {
      const headers = new Headers();
      headers.set("content-type", "application/json");

      global.fetch = mock(() =>
        Promise.resolve({
          status: 200,
          ok: true,
          headers,
        } as Response),
      ) as unknown as typeof fetch;

      await isConnectionAuthenticated({
        url: "https://example.com/api/v1",
        token: "token",
      });

      expect(fetch).toHaveBeenCalledWith(
        "https://example.com/.well-known/oauth-protected-resource",
        expect.any(Object),
      );
    });
  });

  describe("empty token vs null token", () => {
    test("treats empty string token as no token", async () => {
      const headers = new Headers();
      headers.set("content-type", "application/json");

      global.fetch = mock(() =>
        Promise.resolve({
          status: 200,
          ok: true,
          headers,
        } as Response),
      ) as unknown as typeof fetch;

      const result = await isConnectionAuthenticated({
        url: "https://example.com",
        token: "",
      });

      // Empty string is falsy, so no Authorization header should be sent
      expect(result).toBe(false);
      expect(fetch).toHaveBeenCalledWith(
        "https://example.com/.well-known/oauth-protected-resource",
        {
          method: "GET",
          headers: { Accept: "application/json" },
        },
      );
    });
  });
});
