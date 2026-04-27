import {
  describe,
  it,
  expect,
  vi,
  mock,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "bun:test";
import {
  createTestDatabase,
  closeTestDatabase,
  type TestDatabase,
} from "../database/test-db";
import {
  createTestSchema,
  seedCommonTestFixtures,
} from "../storage/test-helpers";
import { CredentialVault } from "../encryption/credential-vault";
import { DownstreamTokenStorage } from "../storage/downstream-token";
import { ConnectionStorage } from "../storage/connection";
import type { TokenRefreshResult } from "@/oauth/refresh-access-token";

const mockRefreshAccessToken =
  vi.fn<
    (
      ...args: Parameters<
        typeof import("@/oauth/refresh-access-token").refreshAccessToken
      >
    ) => Promise<TokenRefreshResult>
  >();
mock.module("@/oauth/refresh-access-token", () => ({
  refreshAccessToken: mockRefreshAccessToken,
}));

const { buildCloneInfo } = await import("./github-clone-info");

describe("buildCloneInfo", () => {
  let database: TestDatabase;
  let vault: CredentialVault;
  let tokenStorage: DownstreamTokenStorage;
  const connectionId = "conn_github_clone_test";
  const originalFetch = globalThis.fetch;
  let fetchCalls: string[] = [];

  beforeAll(async () => {
    database = await createTestDatabase();
    await createTestSchema(database.db);
    await seedCommonTestFixtures(database.db);

    vault = new CredentialVault(CredentialVault.generateKey());
    tokenStorage = new DownstreamTokenStorage(database.db, vault);

    const connectionStorage = new ConnectionStorage(database.db, vault);
    await connectionStorage.create({
      id: connectionId,
      organization_id: "org_123",
      created_by: "user_1",
      title: "GitHub",
      connection_type: "HTTP",
      connection_url: "https://mcp.example.com/github",
      connection_token: null,
      tools: null,
    });
  });

  afterAll(async () => {
    await closeTestDatabase(database);
    globalThis.fetch = originalFetch;
  });

  beforeEach(async () => {
    fetchCalls = [];
    mockRefreshAccessToken.mockReset();
    await tokenStorage.delete(connectionId);
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      _init?: RequestInit,
    ) => {
      const url = typeof input === "string" ? input : input.toString();
      fetchCalls.push(url);
      throw new Error(`buildCloneInfo must not fetch — got ${url}`);
    }) as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns clone URL + bot identity without making any GitHub API call", async () => {
    await tokenStorage.upsert({
      connectionId,
      accessToken: "install-token-abc",
      refreshToken: "rt",
      scope: "repo",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      clientId: "cid",
      clientSecret: "csecret",
      tokenEndpoint: "https://github.com/login/oauth/access_token",
    });

    const info = await buildCloneInfo(
      connectionId,
      "octocat",
      "hello-world",
      database.db,
      vault,
    );

    expect(info.cloneUrl).toBe(
      "https://x-access-token:install-token-abc@github.com/octocat/hello-world.git",
    );
    expect(info.gitUserName).toBe("mcp-github[bot]");
    expect(info.gitUserEmail).toBe("mcp-github[bot]@users.noreply.github.com");
    expect(fetchCalls).toEqual([]);
    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
  });

  it("proactively refreshes an expired token and embeds the fresh one", async () => {
    await tokenStorage.upsert({
      connectionId,
      accessToken: "stale-token",
      refreshToken: "rt",
      scope: "repo",
      expiresAt: new Date(Date.now() - 60 * 1000),
      clientId: "cid",
      clientSecret: "csecret",
      tokenEndpoint: "https://github.com/login/oauth/access_token",
    });

    mockRefreshAccessToken.mockResolvedValueOnce({
      success: true,
      accessToken: "fresh-token",
      refreshToken: "rt2",
      expiresIn: 3600,
      scope: "repo",
    });

    const info = await buildCloneInfo(
      connectionId,
      "octocat",
      "hello-world",
      database.db,
      vault,
    );

    expect(info.cloneUrl).toContain("x-access-token:fresh-token@");
    expect(info.gitUserName).toBe("mcp-github[bot]");
    expect(info.gitUserEmail).toBe("mcp-github[bot]@users.noreply.github.com");
    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchCalls).toEqual([]);
  });

  it("throws RECONNECT_ERROR when proactive refresh fails", async () => {
    await tokenStorage.upsert({
      connectionId,
      accessToken: "stale-token",
      refreshToken: "rt",
      scope: "repo",
      expiresAt: new Date(Date.now() - 60 * 1000),
      clientId: "cid",
      clientSecret: "csecret",
      tokenEndpoint: "https://github.com/login/oauth/access_token",
    });

    mockRefreshAccessToken.mockResolvedValueOnce({
      success: false,
      error: "invalid_grant",
    });

    await expect(
      buildCloneInfo(
        connectionId,
        "octocat",
        "hello-world",
        database.db,
        vault,
      ),
    ).rejects.toThrow(/reconnect/i);

    expect(fetchCalls).toEqual([]);
  });

  it("throws when no token is stored for the connection", async () => {
    await expect(
      buildCloneInfo(
        connectionId,
        "octocat",
        "hello-world",
        database.db,
        vault,
      ),
    ).rejects.toThrow(/No GitHub token found/i);

    expect(fetchCalls).toEqual([]);
  });
});
