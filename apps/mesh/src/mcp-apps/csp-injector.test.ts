/**
 * CSP Injector Tests
 */

import { describe, expect, it } from "bun:test";
import { injectCSP, DEFAULT_CSP } from "./csp-injector";

describe("CSP Injector", () => {
  describe("DEFAULT_CSP", () => {
    it("should have default-src 'none'", () => {
      expect(DEFAULT_CSP).toContain("default-src 'none'");
    });

    it("should allow inline scripts and styles", () => {
      expect(DEFAULT_CSP).toContain("script-src 'unsafe-inline'");
      expect(DEFAULT_CSP).toContain("style-src 'unsafe-inline'");
    });

    it("should block external connections by default", () => {
      expect(DEFAULT_CSP).toContain("connect-src 'none'");
    });

    it("should prevent framing", () => {
      expect(DEFAULT_CSP).toContain("frame-ancestors 'none'");
    });
  });

  describe("injectCSP", () => {
    it("should inject CSP into existing <head>", () => {
      const html = "<html><head><title>Test</title></head><body></body></html>";
      const result = injectCSP(html);

      expect(result).toContain('<meta http-equiv="Content-Security-Policy"');
      expect(result).toContain(DEFAULT_CSP);
      // Should be after <head>
      expect(result.indexOf("<head>")).toBeLessThan(
        result.indexOf("Content-Security-Policy"),
      );
    });

    it("should create <head> if missing", () => {
      const html = "<html><body>Content</body></html>";
      const result = injectCSP(html);

      expect(result).toContain("<head>");
      expect(result).toContain("Content-Security-Policy");
    });

    it("should work with <!DOCTYPE html>", () => {
      const html = "<!DOCTYPE html><html><body>Test</body></html>";
      const result = injectCSP(html);

      expect(result).toContain("Content-Security-Policy");
      expect(result).toContain("<!DOCTYPE html>");
    });

    it("should handle uppercase HEAD tag", () => {
      const html = "<html><HEAD><title>Test</title></HEAD><body></body></html>";
      const result = injectCSP(html);

      expect(result).toContain("Content-Security-Policy");
    });

    it("should use custom CSP if provided", () => {
      const customCSP = "default-src 'self'";
      const html = "<html><head></head></html>";
      const result = injectCSP(html, { csp: customCSP });

      expect(result).toContain(customCSP);
      expect(result).not.toContain(DEFAULT_CSP);
    });

    describe("external connections", () => {
      it("should allow all hosts when allowExternalConnections is true without allowedHosts", () => {
        const html = "<html><head></head></html>";
        const result = injectCSP(html, { allowExternalConnections: true });

        expect(result).toContain("connect-src *");
        expect(result).not.toContain("connect-src 'none'");
      });

      it("should use specified hosts when allowedHosts is provided", () => {
        const html = "<html><head></head></html>";
        const result = injectCSP(html, {
          allowExternalConnections: true,
          allowedHosts: ["https://api.example.com", "https://cdn.example.com"],
        });

        expect(result).toContain(
          "connect-src https://api.example.com https://cdn.example.com",
        );
      });

      it("should treat empty allowedHosts array as wildcard", () => {
        const html = "<html><head></head></html>";
        const result = injectCSP(html, {
          allowExternalConnections: true,
          allowedHosts: [],
        });

        expect(result).toContain("connect-src *");
      });

      it("should not modify connect-src when allowExternalConnections is false", () => {
        const html = "<html><head></head></html>";
        const result = injectCSP(html, { allowExternalConnections: false });

        expect(result).toContain("connect-src 'none'");
      });
    });
  });
});
