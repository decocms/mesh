import { describe, expect, it } from "bun:test";
import { startOAuthCallbackServer } from "./oauth-callback";

describe("startOAuthCallbackServer", () => {
  it("resolves with code + state when the browser hits the callback URL", async () => {
    const server = await startOAuthCallbackServer({ expectedState: "nonce-1" });
    try {
      const result = fetch(`${server.url}/?code=abc&state=nonce-1`).then((r) =>
        r.text(),
      );
      const callback = await server.waitForCallback();
      expect(callback).toEqual({ code: "abc" });
      const body = await result;
      expect(body).toContain("You can return to your terminal");
    } finally {
      server.close();
    }
  });

  it("rejects waitForCallback when state does not match", async () => {
    const server = await startOAuthCallbackServer({ expectedState: "nonce-1" });
    try {
      await fetch(`${server.url}/?code=abc&state=wrong`);
      await expect(server.waitForCallback()).rejects.toThrow(/state mismatch/i);
    } finally {
      server.close();
    }
  });

  it("rejects waitForCallback when code is missing", async () => {
    const server = await startOAuthCallbackServer({ expectedState: "nonce-1" });
    try {
      await fetch(`${server.url}/?state=nonce-1`);
      await expect(server.waitForCallback()).rejects.toThrow(/missing code/i);
    } finally {
      server.close();
    }
  });
});
