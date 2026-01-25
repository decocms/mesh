/**
 * MCP Apps Types Tests
 */

import { describe, expect, it } from "bun:test";
import {
  hasUIResource,
  getUIResourceUri,
  isUIResourceUri,
  MCP_APP_URI_SCHEME,
  UI_RESOURCE_URI_KEY,
  MCP_APP_MIME_TYPE,
  MCP_APP_DISPLAY_MODES,
} from "./types";

describe("MCP Apps Types", () => {
  describe("constants", () => {
    it("should define correct URI scheme", () => {
      expect(MCP_APP_URI_SCHEME).toBe("ui://");
    });

    it("should define correct MIME type", () => {
      expect(MCP_APP_MIME_TYPE).toBe("text/html;profile=mcp-app");
    });

    it("should define correct metadata key", () => {
      expect(UI_RESOURCE_URI_KEY).toBe("ui/resourceUri");
    });
  });

  describe("MCP_APP_DISPLAY_MODES", () => {
    it("should define collapsed mode dimensions", () => {
      expect(MCP_APP_DISPLAY_MODES.collapsed.minHeight).toBe(150);
      expect(MCP_APP_DISPLAY_MODES.collapsed.maxHeight).toBe(400);
    });

    it("should define expanded mode dimensions", () => {
      expect(MCP_APP_DISPLAY_MODES.expanded.minHeight).toBe(500);
      expect(MCP_APP_DISPLAY_MODES.expanded.maxHeight).toBe(700);
    });

    it("should define view mode dimensions", () => {
      expect(MCP_APP_DISPLAY_MODES.view.minHeight).toBe(400);
      expect(MCP_APP_DISPLAY_MODES.view.maxHeight).toBe(800);
    });
  });

  describe("isUIResourceUri", () => {
    it("should return true for valid UI resource URIs", () => {
      expect(isUIResourceUri("ui://counter")).toBe(true);
      expect(isUIResourceUri("ui://mesh/greeting")).toBe(true);
      expect(isUIResourceUri("ui://my-server/my-app")).toBe(true);
    });

    it("should return false for non-UI resource URIs", () => {
      expect(isUIResourceUri("http://example.com")).toBe(false);
      expect(isUIResourceUri("https://example.com")).toBe(false);
      expect(isUIResourceUri("file://test.html")).toBe(false);
      expect(isUIResourceUri("")).toBe(false);
    });
  });

  describe("hasUIResource", () => {
    it("should return true when meta has ui/resourceUri string", () => {
      const meta = { "ui/resourceUri": "ui://counter" };
      expect(hasUIResource(meta)).toBe(true);
    });

    it("should return false when meta is null", () => {
      expect(hasUIResource(null)).toBe(false);
    });

    it("should return false when meta is undefined", () => {
      expect(hasUIResource(undefined)).toBe(false);
    });

    it("should return false when meta is not an object", () => {
      expect(hasUIResource("string")).toBe(false);
      expect(hasUIResource(123)).toBe(false);
      expect(hasUIResource(true)).toBe(false);
    });

    it("should return false when ui/resourceUri is missing", () => {
      const meta = { otherField: "value" };
      expect(hasUIResource(meta)).toBe(false);
    });

    it("should return false when ui/resourceUri is not a string", () => {
      const meta = { "ui/resourceUri": 123 };
      expect(hasUIResource(meta)).toBe(false);
    });

    it("should handle additional metadata fields", () => {
      const meta = {
        "ui/resourceUri": "ui://counter",
        connectionId: "conn_123",
        connectionTitle: "My Connection",
      };
      expect(hasUIResource(meta)).toBe(true);
    });
  });

  describe("getUIResourceUri", () => {
    it("should return URI when meta has ui/resourceUri", () => {
      const meta = { "ui/resourceUri": "ui://counter" };
      expect(getUIResourceUri(meta)).toBe("ui://counter");
    });

    it("should return undefined when meta is null", () => {
      expect(getUIResourceUri(null)).toBeUndefined();
    });

    it("should return undefined when meta is undefined", () => {
      expect(getUIResourceUri(undefined)).toBeUndefined();
    });

    it("should return undefined when ui/resourceUri is missing", () => {
      const meta = { other: "value" };
      expect(getUIResourceUri(meta)).toBeUndefined();
    });

    it("should return undefined when ui/resourceUri is not a string", () => {
      const meta = { "ui/resourceUri": null };
      expect(getUIResourceUri(meta)).toBeUndefined();
    });
  });
});
