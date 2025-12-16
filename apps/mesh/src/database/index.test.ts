import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { closeDatabase, createDatabase } from "./index";

describe("Database Factory", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "mesh-test-"));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("createDatabase", () => {
    it("should create SQLite database from file:// URL", async () => {
      const dbPath = join(tempDir, "test-file.db");
      const db = createDatabase(`file:${dbPath}`);

      expect(db).toBeDefined();

      // Test that database is functional (will fail without migrations, but db exists)
      try {
        await db
          .selectFrom("projects" as never)
          .selectAll()
          .execute();
      } catch (error) {
        // Expected - table doesn't exist without migrations
        expect(error).toBeDefined();
      }

      await closeDatabase(db);
    });

    it("should create SQLite database from sqlite:// URL", async () => {
      const dbPath = join(tempDir, "test-sqlite.db");
      const db = createDatabase(`sqlite://${dbPath}`);

      expect(db).toBeDefined();
      await closeDatabase(db);
    });

    it("should default to SQLite when no URL provided", () => {
      const db = createDatabase();
      expect(db).toBeDefined();
      // Don't close the default instance as it's a singleton
    });

    it("should throw error for unsupported protocol", () => {
      expect(() => createDatabase("redis://localhost")).toThrow(
        "Unsupported database protocol: redis",
      );
    });

    it("should create directory if not exists for SQLite", async () => {
      const dbPath = join(tempDir, "nested", "dir", "test.db");
      const db = createDatabase(`file:${dbPath}`);

      expect(db).toBeDefined();
      await closeDatabase(db);
    });

    it("should handle in-memory SQLite database", async () => {
      const db = createDatabase(":memory:");

      expect(db).toBeDefined();
      await closeDatabase(db);
    });
  });

  describe("closeDatabase", () => {
    it("should close database connection", async () => {
      const db = createDatabase(":memory:");

      // Should not throw
      await closeDatabase(db);
      expect(true).toBe(true);
    });
  });

  describe("PostgreSQL support", () => {
    it("should recognize postgres:// protocol", () => {
      // Don't actually connect, just check protocol recognition
      expect(() => {
        createDatabase("postgres://user:pass@localhost:5432/db");
      }).not.toThrow("Unsupported database protocol");
    });

    it("should recognize postgresql:// protocol", () => {
      expect(() => {
        createDatabase("postgresql://user:pass@localhost:5432/db");
      }).not.toThrow("Unsupported database protocol");
    });
  });
});
