import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createDatabase, closeDatabase, type MeshDatabase } from "../database";
import { createTestSchema } from "./test-helpers";
import { CredentialVault } from "../encryption/credential-vault";
import {
  DownstreamTokenStorage,
  type DownstreamTokenData,
} from "./downstream-token";

describe("DownstreamTokenStorage", () => {
  let database: MeshDatabase;
  let storage: DownstreamTokenStorage;

  beforeAll(async () => {
    database = createDatabase(":memory:");
    await createTestSchema(database.db);

    const vault = new CredentialVault(CredentialVault.generateKey());
    storage = new DownstreamTokenStorage(database.db, vault);
  });

  afterAll(async () => {
    await closeDatabase(database);
  });

  it("should fail-safe invalid expiration date as expired", async () => {
    const token = {
      id: "test",
      connectionId: "c1",
      userId: "u1",
      accessToken: "at",
      refreshToken: null,
      scope: null,
      expiresAt: "invalid-date-string", // Invalid date
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      clientId: null,
      clientSecret: null,
      tokenEndpoint: null,
    };

    // Before fix: new Date("invalid").getTime() is NaN. NaN < Date.now() is false.
    // After fix: should return true.
    expect(storage.isExpired(token)).toBe(true);
  });

  it("should upsert token atomically", async () => {
    const data: DownstreamTokenData = {
      connectionId: "conn_atomic",
      userId: "user_atomic",
      accessToken: "access_1",
      refreshToken: "refresh_1",
      scope: "scope_1",
      expiresAt: new Date(Date.now() + 3600000),
      clientId: "client_1",
      clientSecret: "secret_1",
      tokenEndpoint: "https://example.com/token",
    };

    // First insert
    const t1 = await storage.upsert(data);
    expect(t1.accessToken).toBe("access_1");
    expect(t1.clientId).toBe("client_1");

    // Update
    const data2 = { ...data, accessToken: "access_2", clientId: "client_2" };
    const t2 = await storage.upsert(data2);

    expect(t2.id).toBe(t1.id); // Should update same record
    expect(t2.accessToken).toBe("access_2");
    expect(t2.clientId).toBe("client_2");

    // Check DB count
    const count = await database.db
      .selectFrom("downstream_tokens")
      .select(database.db.fn.count("id").as("c"))
      .executeTakeFirst();
    expect(Number(count?.c)).toBe(1);
  });
});
