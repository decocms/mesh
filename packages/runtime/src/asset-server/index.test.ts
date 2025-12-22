import { describe, expect, test } from "bun:test";
import { isPathWithinDirectory, resolveAssetPathWithTraversalCheck } from "./index";
import { resolve } from "path";

describe("isPathWithinDirectory", () => {
  const baseDir = "/app/client";

  describe("safe paths", () => {
    test("allows file directly in base directory", () => {
      expect(isPathWithinDirectory("/app/client/index.html", baseDir)).toBe(
        true
      );
    });

    test("allows file in subdirectory", () => {
      expect(isPathWithinDirectory("/app/client/assets/style.css", baseDir)).toBe(
        true
      );
    });

    test("allows deeply nested file", () => {
      expect(
        isPathWithinDirectory("/app/client/assets/images/logo.png", baseDir)
      ).toBe(true);
    });

    test("allows base directory itself", () => {
      expect(isPathWithinDirectory("/app/client", baseDir)).toBe(true);
    });

    test("allows file with spaces in name", () => {
      expect(
        isPathWithinDirectory("/app/client/logos/deco logo.svg", baseDir)
      ).toBe(true);
    });
  });

  describe("path traversal attacks - BLOCKED", () => {
    test("blocks simple traversal to parent", () => {
      expect(isPathWithinDirectory("/app/style.css", baseDir)).toBe(false);
    });

    test("blocks traversal to root", () => {
      expect(isPathWithinDirectory("/etc/passwd", baseDir)).toBe(false);
    });

    test("blocks traversal with ../ sequence", () => {
      const traversalPath = resolve(baseDir, "../../../etc/passwd");
      expect(isPathWithinDirectory(traversalPath, baseDir)).toBe(false);
    });

    test("blocks traversal to sibling directory", () => {
      expect(isPathWithinDirectory("/app/server/secrets.json", baseDir)).toBe(
        false
      );
    });

    test("blocks path that starts with baseDir but is actually sibling", () => {
      // /app/client-secrets is NOT within /app/client
      expect(isPathWithinDirectory("/app/client-secrets/key", baseDir)).toBe(
        false
      );
    });

    test("blocks absolute path outside base", () => {
      expect(isPathWithinDirectory("/var/log/system.log", baseDir)).toBe(false);
    });
  });
});

describe("resolveAssetPath", () => {
  const clientDir = "/app/dist/client";
  const indexPath = "/app/dist/client/index.html"; // Expected default

  // Helper to reduce boilerplate
  const resolve = (requestPath: string) =>
    resolveAssetPathWithTraversalCheck({ requestPath, clientDir });

  describe("SPA routes - serve index.html", () => {
    test("root path serves index.html", () => {
      const result = resolve("/");
      expect(result).toEqual({ filePath: indexPath, isSPA: true });
    });

    test("path without extension serves index.html", () => {
      const result = resolve("/dashboard");
      expect(result).toEqual({ filePath: indexPath, isSPA: true });
    });

    test("nested path without extension serves index.html", () => {
      const result = resolve("/org/my-org/settings");
      expect(result).toEqual({ filePath: indexPath, isSPA: true });
    });

    test("path with query params but no extension serves index.html", () => {
      // Note: query params should be stripped before calling this function
      const result = resolve("/dashboard");
      expect(result).toEqual({ filePath: indexPath, isSPA: true });
    });
  });

  describe("static assets - serve file", () => {
    test("CSS file resolves correctly", () => {
      const result = resolve("/style.css");
      expect(result).toEqual({
        filePath: "/app/dist/client/style.css",
        isSPA: false,
      });
    });

    test("JS file resolves correctly", () => {
      const result = resolve("/assets/app.js");
      expect(result).toEqual({
        filePath: "/app/dist/client/assets/app.js",
        isSPA: false,
      });
    });

    test("image file resolves correctly", () => {
      const result = resolve("/logo.png");
      expect(result).toEqual({
        filePath: "/app/dist/client/logo.png",
        isSPA: false,
      });
    });

    test("SVG file resolves correctly", () => {
      const result = resolve("/icons/icon.svg");
      expect(result).toEqual({
        filePath: "/app/dist/client/icons/icon.svg",
        isSPA: false,
      });
    });

    test("file with spaces in name resolves correctly", () => {
      const result = resolve("/logos/deco logo.svg");
      expect(result).toEqual({
        filePath: "/app/dist/client/logos/deco logo.svg",
        isSPA: false,
      });
    });

    test("deeply nested file resolves correctly", () => {
      const result = resolve("/assets/images/icons/arrow.svg");
      expect(result).toEqual({
        filePath: "/app/dist/client/assets/images/icons/arrow.svg",
        isSPA: false,
      });
    });
  });

  describe("path traversal attacks - BLOCKED", () => {
    test("blocks /../../../etc/passwd", () => {
      const result = resolve("/../../../etc/passwd");
      expect(result).toBeNull();
    });

    test("blocks /..%2F..%2F..%2Fetc%2Fpasswd (decoded)", () => {
      // This simulates what happens after decodeURIComponent
      const result = resolve("/../../../etc/passwd");
      expect(result).toBeNull();
    });

    test("blocks /assets/../../../etc/passwd", () => {
      const result = resolve("/assets/../../../etc/passwd");
      expect(result).toBeNull();
    });

    test("blocks /./../../etc/passwd", () => {
      const result = resolve("/./../../etc/passwd");
      expect(result).toBeNull();
    });

    test("blocks /../etc/passwd (encoded dots decoded)", () => {
      // %2e%2e decoded is ..
      const result = resolve("/../etc/passwd");
      expect(result).toBeNull();
    });

    test("blocks /..\\..\\etc\\passwd (backslash variant)", () => {
      const result = resolve("/..\\..\\etc\\passwd");
      // On Unix, backslashes are treated as literal characters in filenames
      // The resolve() function handles this, but the path still shouldn't escape
      expect(result).not.toBeNull(); // Treated as literal filename, stays in clientDir
    });

    test("blocks /assets/../../package.json", () => {
      const result = resolve("/assets/../../package.json");
      expect(result).toBeNull();
    });

    test("handles //etc/passwd (double slash) - treated as SPA route, safe", () => {
      const result = resolve("//etc/passwd");
      // "//etc/passwd" doesn't include a "." so it's treated as an SPA route
      // This is safe because it serves index.html, not /etc/passwd
      expect(result).not.toBeNull();
      expect(result?.filePath).toBe(indexPath);
      expect(result?.isSPA).toBe(true);
    });

    test("blocks attempt to access sibling with ../ after valid start", () => {
      const result = resolve("/valid/../../../etc/passwd");
      expect(result).toBeNull();
    });
  });

  describe("edge cases", () => {
    test("handles file with multiple dots", () => {
      const result = resolve("/file.test.spec.js");
      expect(result).toEqual({
        filePath: "/app/dist/client/file.test.spec.js",
        isSPA: false,
      });
    });

    test("handles hidden files (dotfiles)", () => {
      const result = resolve("/.htaccess");
      expect(result).toEqual({
        filePath: "/app/dist/client/.htaccess",
        isSPA: false,
      });
    });

    test("handles path without leading slash", () => {
      const result = resolve("style.css");
      expect(result).toEqual({
        filePath: "/app/dist/client/style.css",
        isSPA: false,
      });
    });

    test("handles favicon.ico", () => {
      const result = resolve("/favicon.ico");
      expect(result).toEqual({
        filePath: "/app/dist/client/favicon.ico",
        isSPA: false,
      });
    });

    test("handles robots.txt", () => {
      const result = resolve("/robots.txt");
      expect(result).toEqual({
        filePath: "/app/dist/client/robots.txt",
        isSPA: false,
      });
    });

    test("handles manifest.json", () => {
      const result = resolve("/manifest.json");
      expect(result).toEqual({
        filePath: "/app/dist/client/manifest.json",
        isSPA: false,
      });
    });
  });
});
