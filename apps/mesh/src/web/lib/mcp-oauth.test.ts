import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { isConnectionAuthenticated, handleOAuthCallback } from "./mcp-oauth";

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

describe("handleOAuthCallback", () => {
  // Skip if window is not defined (running in Node.js/Bun without DOM)
  const isBrowser = typeof globalThis.window !== "undefined";

  // Mock storage
  const mockStorage: Record<string, string> = {};

  // Create a minimal window mock for server-side testing
  const createWindowMock = () => ({
    location: {
      search: "",
      origin: "http://localhost:3000",
    },
    opener: null as Window | null,
    localStorage: {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        for (const key in mockStorage) {
          delete mockStorage[key];
        }
      },
    },
  });

  let windowMock: ReturnType<typeof createWindowMock>;

  beforeEach(() => {
    windowMock = createWindowMock();

    // Set up globalThis.window if not in browser
    if (!isBrowser) {
      (globalThis as unknown as { window: unknown }).window = windowMock;
    }

    // Clear mock storage
    for (const key in mockStorage) {
      delete mockStorage[key];
    }
  });

  afterEach(() => {
    // Clean up window mock
    if (!isBrowser) {
      delete (globalThis as unknown as { window?: unknown }).window;
    }

    // Clear mock storage
    for (const key in mockStorage) {
      delete mockStorage[key];
    }
  });

  const mockLocation = (search: string) => {
    windowMock.location = {
      search,
      origin: "http://localhost:3000",
    };
    if (!isBrowser) {
      (globalThis as unknown as { window: typeof windowMock }).window =
        windowMock;
    }
  };

  const mockOpener = (postMessage: ReturnType<typeof mock> | null) => {
    if (postMessage === null) {
      windowMock.opener = null;
    } else {
      windowMock.opener = {
        postMessage,
        closed: false,
      } as unknown as Window;
    }
    if (!isBrowser) {
      (globalThis as unknown as { window: typeof windowMock }).window =
        windowMock;
    }
  };

  describe("with window.opener available", () => {
    test("posts message to opener with code and state", async () => {
      mockLocation("?code=auth_code_123&state=state_abc");
      const postMessageMock = mock(() => {});
      mockOpener(postMessageMock);

      const result = await handleOAuthCallback();

      expect(result.success).toBe(true);
      expect(postMessageMock).toHaveBeenCalledTimes(1);

      const callArgs = postMessageMock.mock.calls[0];
      expect(callArgs).toBeDefined();
      const [message, origin] = callArgs as unknown as [unknown, string];
      expect(message).toEqual({
        type: "mcp:oauth:callback",
        success: true,
        code: "auth_code_123",
        state: "state_abc",
      });
      expect(origin).toBe("http://localhost:3000");
    });

    test("handles error parameter from OAuth provider", async () => {
      mockLocation("?error=access_denied&error_description=User%20denied");
      const postMessageMock = mock(() => {});
      mockOpener(postMessageMock);

      const result = await handleOAuthCallback();

      expect(result.success).toBe(false);
      expect(result.error).toBe("User denied");
      expect(postMessageMock).toHaveBeenCalledTimes(1);

      const callArgs = postMessageMock.mock.calls[0];
      expect(callArgs).toBeDefined();
      const [message] = callArgs as unknown as [unknown];
      expect(message).toEqual({
        type: "mcp:oauth:callback",
        success: false,
        error: "User denied",
      });
    });

    test("handles missing code parameter", async () => {
      mockLocation("?state=state_abc");
      const postMessageMock = mock(() => {});
      mockOpener(postMessageMock);

      const result = await handleOAuthCallback();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Missing code or state parameter");
    });

    test("handles missing state parameter", async () => {
      mockLocation("?code=auth_code_123");
      const postMessageMock = mock(() => {});
      mockOpener(postMessageMock);

      const result = await handleOAuthCallback();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Missing code or state parameter");
    });
  });

  describe("with window.opener not available (localStorage fallback)", () => {
    // Note: These tests verify the fallback behavior when window.opener is null.
    // The localStorage integration requires a real browser environment.
    // Full localStorage fallback testing should be done in e2e tests.

    test("returns error when opener is null and no state for localStorage key", async () => {
      mockLocation("?code=auth_code_123");
      mockOpener(null);

      const result = await handleOAuthCallback();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Missing code or state parameter");
    });

    test("attempts localStorage fallback when opener is null (integration test needed for full verification)", async () => {
      // This test verifies the code path runs without error
      // Full localStorage verification requires browser/e2e testing
      mockLocation("?code=auth_code_123&state=state_xyz");
      mockOpener(null);

      const result = await handleOAuthCallback();

      // When opener is null and localStorage isn't properly mocked in Bun,
      // the function will return false with "Parent window not available"
      // In a real browser with localStorage, this would succeed
      expect(result.success).toBe(false);
      expect(result.error).toBe("Parent window not available");
    });
  });

  describe("state decoding (deco.cx wrapped state)", () => {
    test("decodes base64 wrapped state with clientState", async () => {
      // Create a wrapped state like deco.cx does
      const wrappedState = btoa(
        JSON.stringify({
          clientState: "original_state_123",
          otherData: "ignored",
        }),
      );

      mockLocation(`?code=auth_code&state=${encodeURIComponent(wrappedState)}`);
      const postMessageMock = mock(() => {});
      mockOpener(postMessageMock);

      const result = await handleOAuthCallback();

      expect(result.success).toBe(true);

      const callArgs = postMessageMock.mock.calls[0];
      expect(callArgs).toBeDefined();
      const [message] = callArgs as unknown as [unknown];
      expect((message as Record<string, unknown>).state).toBe(
        "original_state_123",
      );
    });

    test("uses state as-is when not valid base64 JSON", async () => {
      mockLocation("?code=auth_code&state=plain_state");
      const postMessageMock = mock(() => {});
      mockOpener(postMessageMock);

      const result = await handleOAuthCallback();

      expect(result.success).toBe(true);

      const callArgs = postMessageMock.mock.calls[0];
      expect(callArgs).toBeDefined();
      const [message] = callArgs as unknown as [unknown];
      expect((message as Record<string, unknown>).state).toBe("plain_state");
    });

    test("uses state as-is when base64 but not JSON", async () => {
      const invalidJson = btoa("not json");
      mockLocation(`?code=auth_code&state=${encodeURIComponent(invalidJson)}`);
      const postMessageMock = mock(() => {});
      mockOpener(postMessageMock);

      const result = await handleOAuthCallback();

      expect(result.success).toBe(true);

      const callArgs = postMessageMock.mock.calls[0];
      expect(callArgs).toBeDefined();
      const [message] = callArgs as unknown as [unknown];
      // Should use the original encoded state
      expect((message as Record<string, unknown>).state).toBe(invalidJson);
    });

    // Note: localStorage key verification requires browser/e2e testing
    // The state decoding logic is verified by the "decodes base64 wrapped state" test above
  });
});
