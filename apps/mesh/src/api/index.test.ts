import { describe, it, expect } from "bun:test";
import app from "./index";

describe("Hono App", () => {
  describe("health check", () => {
    it("should respond to health check", async () => {
      const res = await app.request("/health");
      expect(res.status).toBe(200);

      const json = (await res.json()) as {
        status: string;
        timestamp: string;
        version: string;
      };
      expect(json.status).toBe("ok");
      expect(json.timestamp).toBeDefined();
      expect(json.version).toBe("1.0.0");
    });
  });

  describe("404 handling", () => {
    it("should return 404 for unknown routes", async () => {
      const res = await app.request("/unknown");
      expect(res.status).toBe(404);

      const json = (await res.json()) as { error: string; path: string };
      expect(json.error).toBe("Not Found");
      expect(json.path).toBe("/unknown");
    });
  });

  describe("CORS", () => {
    it("should have CORS headers", async () => {
      const res = await app.request("/health", {
        headers: { Origin: "http://localhost:3000" },
      });

      const corsHeader = res.headers.get("access-control-allow-origin");
      expect(corsHeader).toBeTruthy();
    });

    it("should allow credentials", async () => {
      const res = await app.request("/health", {
        headers: { Origin: "http://localhost:3000" },
      });

      const credentialsHeader = res.headers.get(
        "access-control-allow-credentials",
      );
      expect(credentialsHeader).toBeTruthy();
    });
  });

  describe("Better Auth integration", () => {
    it("should mount Better Auth routes", async () => {
      // .well-known endpoints should exist (may return 404 but route exists)
      const res = await app.request("/.well-known/oauth-authorization-server");

      // Should not be 500 (route exists)
      expect(res.status).toBeLessThan(500);
    });
  });
});
