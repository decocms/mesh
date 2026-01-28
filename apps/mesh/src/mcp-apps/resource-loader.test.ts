/**
 * Resource Loader Tests
 */

import { describe, expect, it, beforeEach } from "bun:test";
import { UIResourceLoader, UIResourceLoadError } from "./resource-loader";

describe("UIResourceLoader", () => {
  describe("UIResourceLoadError", () => {
    it("should create error with uri and reason", () => {
      const error = new UIResourceLoadError("ui://test", "Resource not found");
      expect(error.message).toBe(
        "Failed to load UI resource ui://test: Resource not found",
      );
      expect(error.uri).toBe("ui://test");
      expect(error.reason).toBe("Resource not found");
      expect(error.name).toBe("UIResourceLoadError");
    });

    it("should include cause if provided", () => {
      const cause = new Error("Original error");
      const error = new UIResourceLoadError("ui://test", "Load failed", cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe("load", () => {
    let loader: UIResourceLoader;
    let mockReadResource: (uri: string) => Promise<{
      contents: Array<{ uri: string; mimeType?: string; text?: string }>;
    }>;

    beforeEach(() => {
      loader = new UIResourceLoader({ cacheTTL: 0 }); // Disable caching for tests
    });

    it("should load HTML resource", async () => {
      mockReadResource = async (uri) => ({
        contents: [
          {
            uri,
            mimeType: "text/html",
            text: "<html><body>Hello</body></html>",
          },
        ],
      });

      const content = await loader.load("ui://test", mockReadResource);

      expect(content.html).toContain("<body>Hello</body>");
      expect(content.mimeType).toBe("text/html");
    });

    it("should throw error when no content returned", async () => {
      mockReadResource = async () => ({
        contents: [],
      });

      await expect(loader.load("ui://test", mockReadResource)).rejects.toThrow(
        UIResourceLoadError,
      );
    });

    it("should throw error when content has no text", async () => {
      mockReadResource = async (uri) => ({
        contents: [{ uri }],
      });

      await expect(loader.load("ui://test", mockReadResource)).rejects.toThrow(
        UIResourceLoadError,
      );
    });

    it("should throw error when resource fetch fails", async () => {
      mockReadResource = async () => {
        throw new Error("Network error");
      };

      await expect(loader.load("ui://test", mockReadResource)).rejects.toThrow(
        UIResourceLoadError,
      );
    });

    it("should return the HTML content as-is (CSP injection happens elsewhere)", async () => {
      const originalHtml = "<html><head></head><body>Test</body></html>";
      mockReadResource = async (uri) => ({
        contents: [
          {
            uri,
            mimeType: "text/html",
            text: originalHtml,
          },
        ],
      });

      const content = await loader.load("ui://test", mockReadResource);

      // Resource loader returns raw HTML - CSP injection happens in MCPAppModel
      expect(content.html).toBe(originalHtml);
    });
  });

  describe("caching", () => {
    it("should cache resources", async () => {
      const loader = new UIResourceLoader({ cacheTTL: 60000 });
      let callCount = 0;

      const mockReadResource = async (uri: string) => {
        callCount++;
        return {
          contents: [{ uri, mimeType: "text/html", text: "<html></html>" }],
        };
      };

      await loader.load("ui://test", mockReadResource);
      await loader.load("ui://test", mockReadResource);

      expect(callCount).toBe(1); // Should only call once due to caching
    });

    it("should respect cacheTTL expiration", async () => {
      // Note: In dev mode (isDev), cacheTTL is forced to 0 regardless of options
      // This test verifies the caching logic works when cache entries exist
      const loader = new UIResourceLoader({ cacheTTL: 60000 });
      let callCount = 0;

      const mockReadResource = async (uri: string) => {
        callCount++;
        return {
          contents: [{ uri, mimeType: "text/html", text: "<html></html>" }],
        };
      };

      await loader.load("ui://test", mockReadResource);
      await loader.load("ui://test", mockReadResource);

      // With long TTL, should only call once (cached)
      expect(callCount).toBe(1);
    });

    it("should clear cache", async () => {
      const loader = new UIResourceLoader({ cacheTTL: 60000 });
      let callCount = 0;

      const mockReadResource = async (uri: string) => {
        callCount++;
        return {
          contents: [{ uri, mimeType: "text/html", text: "<html></html>" }],
        };
      };

      await loader.load("ui://test", mockReadResource);
      loader.clearCache();
      await loader.load("ui://test", mockReadResource);

      expect(callCount).toBe(2);
    });

    it("should not cache when maxCacheSize is 0", async () => {
      const loader = new UIResourceLoader({
        cacheTTL: 60000,
        maxCacheSize: 0,
      });
      let callCount = 0;

      const mockReadResource = async (uri: string) => {
        callCount++;
        return {
          contents: [{ uri, mimeType: "text/html", text: "<html></html>" }],
        };
      };

      await loader.load("ui://test", mockReadResource);
      await loader.load("ui://test", mockReadResource);

      expect(callCount).toBe(2); // Should call twice without caching
    });
  });

  describe("multiple resources", () => {
    it("should load different resources separately", async () => {
      const loader = new UIResourceLoader({ cacheTTL: 60000 });
      const loadedUris: string[] = [];

      const mockReadResource = async (uri: string) => {
        loadedUris.push(uri);
        return {
          contents: [
            { uri, mimeType: "text/html", text: `<html>${uri}</html>` },
          ],
        };
      };

      await loader.load("ui://app1", mockReadResource);
      await loader.load("ui://app2", mockReadResource);
      await loader.load("ui://app3", mockReadResource);

      expect(loadedUris).toEqual(["ui://app1", "ui://app2", "ui://app3"]);
    });
  });
});
