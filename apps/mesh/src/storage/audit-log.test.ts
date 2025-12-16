import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createDatabase, closeDatabase } from "../database";
import { createTestSchema } from "./test-helpers";
import { AuditLogStorage } from "./audit-log";
import type { Kysely } from "kysely";
import type { Database } from "./types";

describe("AuditLogStorage", () => {
  let db: Kysely<Database>;
  let storage: AuditLogStorage;

  beforeAll(async () => {
    const tempDbPath = `/tmp/test-audit-log-${Date.now()}.db`;
    db = createDatabase(`file:${tempDbPath}`);
    storage = new AuditLogStorage(db);
    await createTestSchema(db);
  });

  afterAll(async () => {
    await closeDatabase(db);
  });

  describe("log", () => {
    it("should create audit log entry", async () => {
      await storage.log({
        organizationId: "org_123",
        userId: "user_123",
        connectionId: "conn_123",
        toolName: "TEST_TOOL",
        allowed: true,
        duration: 150,
        timestamp: new Date(),
        requestMetadata: { input: "test" },
      });

      // Query to verify
      const logs = await storage.query({ toolName: "TEST_TOOL" });
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0]!.toolName).toBe("TEST_TOOL");
    });

    it("should handle minimal audit log", async () => {
      await storage.log({
        toolName: "MINIMAL_TOOL",
        allowed: false,
        timestamp: new Date(),
      });

      const logs = await storage.query({ toolName: "MINIMAL_TOOL" });
      expect(logs.length).toBe(1);
      expect(logs[0]!.allowed).toBe(false);
      expect(logs[0]!.userId).toBeNull();
    });

    it("should serialize requestMetadata as JSON", async () => {
      await storage.log({
        toolName: "JSON_TEST",
        allowed: true,
        timestamp: new Date(),
        requestMetadata: { complex: { nested: "data" } },
      });

      const logs = await storage.query({ toolName: "JSON_TEST" });
      expect(logs[0]!.requestMetadata).toEqual({ complex: { nested: "data" } });
    });
  });

  describe("query", () => {
    beforeAll(async () => {
      // Create some test logs
      await storage.log({
        organizationId: "org_a",
        userId: "user_a",
        toolName: "TOOL_A",
        allowed: true,
        timestamp: new Date("2025-01-01"),
      });

      await storage.log({
        organizationId: "org_b",
        userId: "user_b",
        toolName: "TOOL_B",
        allowed: false,
        timestamp: new Date("2025-01-02"),
      });
    });

    it("should query all logs without filters", async () => {
      const logs = await storage.query({});
      expect(logs.length).toBeGreaterThan(0);
    });

    it("should filter by organizationId", async () => {
      const logs = await storage.query({ organizationId: "org_a" });
      expect(logs.every((l) => l.organizationId === "org_a")).toBe(true);
    });

    it("should filter by userId", async () => {
      const logs = await storage.query({ userId: "user_a" });
      expect(logs.every((l) => l.userId === "user_a")).toBe(true);
    });

    it("should filter by toolName", async () => {
      const logs = await storage.query({ toolName: "TOOL_A" });
      expect(logs.every((l) => l.toolName === "TOOL_A")).toBe(true);
    });

    it("should filter by date range", async () => {
      const logs = await storage.query({
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-01-01T23:59:59"),
      });

      expect(logs.length).toBeGreaterThan(0);
    });

    it("should support pagination with limit", async () => {
      const logs = await storage.query({ limit: 1 });
      expect(logs.length).toBeLessThanOrEqual(1);
    });

    // Note: offset not fully supported by kysely-bun-worker yet
    // it('should support pagination with offset', async () => {
    //   const allLogs = await storage.query({});
    //   const offsetLogs = await storage.query({ offset: 1 });
    //   expect(offsetLogs.length).toBe(allLogs.length - 1);
    // });

    it("should combine multiple filters", async () => {
      const logs = await storage.query({
        organizationId: "org_a",
        userId: "user_a",
        toolName: "TOOL_A",
      });

      expect(
        logs.every(
          (l) =>
            l.organizationId === "org_a" &&
            l.userId === "user_a" &&
            l.toolName === "TOOL_A",
        ),
      ).toBe(true);
    });
  });

  describe("boolean conversion", () => {
    it("should convert SQLite boolean to true", async () => {
      await storage.log({
        toolName: "BOOL_TRUE",
        allowed: true,
        timestamp: new Date(),
      });

      const logs = await storage.query({ toolName: "BOOL_TRUE" });
      expect(logs[0]!.allowed).toBe(true);
      expect(typeof logs[0]!.allowed).toBe("boolean");
    });

    it("should convert SQLite boolean to false", async () => {
      await storage.log({
        toolName: "BOOL_FALSE",
        allowed: false,
        timestamp: new Date(),
      });

      const logs = await storage.query({ toolName: "BOOL_FALSE" });
      expect(logs[0]!.allowed).toBe(false);
      expect(typeof logs[0]!.allowed).toBe("boolean");
    });
  });
});
