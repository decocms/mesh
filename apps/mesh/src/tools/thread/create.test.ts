import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { COLLECTION_THREADS_CREATE } from "./create";
import { buildThreadTestContext, type ThreadTestEnv } from "./test-helpers";

describe("COLLECTION_THREADS_CREATE", () => {
  let env: ThreadTestEnv;

  beforeAll(async () => {
    env = await buildThreadTestContext();
  });
  afterAll(async () => {
    await env.close();
  });

  it("assigns a generated branch when the vMCP has a github repo", async () => {
    const vmcp = await env.ctx.storage.virtualMcps.create(
      env.orgId,
      env.userId,
      {
        title: "gh-vmcp",
        connections: [],
        status: "active",
        pinned: false,
        metadata: {
          githubRepo: {
            owner: "acme",
            name: "repo",
            url: "https://github.com/acme/repo",
            installationId: 1,
            connectionId: "conn_x",
          },
        },
      },
    );

    const result = await COLLECTION_THREADS_CREATE.handler(
      { data: { virtual_mcp_id: vmcp.id, title: "t" } },
      env.ctx,
    );

    expect(result.item.branch).toMatch(/^deco\/[a-z]+-[a-z]+$/);
    expect(result.item.virtual_mcp_id).toBe(vmcp.id);
  });

  it("leaves branch null when the vMCP has no github repo", async () => {
    const vmcp = await env.ctx.storage.virtualMcps.create(
      env.orgId,
      env.userId,
      { title: "no-gh", connections: [], status: "active", pinned: false },
    );

    const result = await COLLECTION_THREADS_CREATE.handler(
      { data: { virtual_mcp_id: vmcp.id, title: "t" } },
      env.ctx,
    );

    expect(result.item.branch).toBeNull();
  });

  // NOTE: This test fails until Task 4 (storage ON CONFLICT DO NOTHING) lands.
  it("is idempotent: creating with the same id twice returns the same row", async () => {
    const vmcp = await env.ctx.storage.virtualMcps.create(
      env.orgId,
      env.userId,
      { title: "x", connections: [], status: "active", pinned: false },
    );

    const id = "thrd_test_idempotent";
    const first = await COLLECTION_THREADS_CREATE.handler(
      { data: { id, virtual_mcp_id: vmcp.id, title: "first" } },
      env.ctx,
    );
    const second = await COLLECTION_THREADS_CREATE.handler(
      { data: { id, virtual_mcp_id: vmcp.id, title: "second" } },
      env.ctx,
    );

    expect(second.item.id).toBe(first.item.id);
    expect(second.item.title).toBe("first"); // existing row, not overwritten
  });
});
