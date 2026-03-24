import { describe, expect, it, mock, spyOn } from "bun:test";
import { z } from "zod";
import { createTriggers } from "./triggers.ts";

const triggers = createTriggers([
  {
    type: "github.push",
    description: "Triggered when code is pushed",
    params: z.object({
      repo: z.string().describe("Repository full name (owner/repo)"),
    }),
  },
  {
    type: "github.pull_request.opened",
    description: "Triggered when a PR is opened",
    params: z.object({
      repo: z.string().describe("Repository full name"),
    }),
  },
]);

describe("createTriggers", () => {
  it("tools() returns TRIGGER_LIST and TRIGGER_CONFIGURE", () => {
    const tools = triggers.tools();
    expect(tools).toHaveLength(2);
    expect(tools[0].id).toBe("TRIGGER_LIST");
    expect(tools[1].id).toBe("TRIGGER_CONFIGURE");
  });

  it("TRIGGER_LIST returns trigger definitions with paramsSchema", async () => {
    const listTool = triggers.tools()[0];
    const result = (await listTool.execute({
      context: {},
      runtimeContext: { env: {}, ctx: { waitUntil: () => {} } },
    })) as {
      triggers: Array<{ type: string; paramsSchema: Record<string, unknown> }>;
    };

    expect(result.triggers).toHaveLength(2);
    expect(result.triggers[0].type).toBe("github.push");
    expect(result.triggers[0].paramsSchema).toEqual({
      repo: {
        type: "string",
        description: "Repository full name (owner/repo)",
      },
    });
    expect(result.triggers[1].type).toBe("github.pull_request.opened");
  });

  it("TRIGGER_CONFIGURE stores callback credentials and notify delivers", async () => {
    const configureTool = triggers.tools()[1];

    const mockResponse = new Response("ok", { status: 202 });
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);

    // Configure a trigger with callback
    await configureTool.execute({
      context: {
        type: "github.push",
        params: { repo: "owner/repo" },
        enabled: true,
        callbackUrl: "https://mesh.example.com/api/trigger-callback",
        callbackToken: "test-token-123",
      },
      runtimeContext: {
        env: {
          MESH_REQUEST_CONTEXT: { connectionId: "conn-1" },
        },
        ctx: { waitUntil: () => {} },
      },
    });

    // Notify should POST to the callback URL
    triggers.notify("conn-1", "github.push", {
      repository: { full_name: "owner/repo" },
    });

    // Wait for the fire-and-forget fetch
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://mesh.example.com/api/trigger-callback",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token-123",
        },
      }),
    );

    const callBody = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(callBody.type).toBe("github.push");
    expect(callBody.data.repository.full_name).toBe("owner/repo");

    fetchSpy.mockRestore();
  });

  it("TRIGGER_CONFIGURE with enabled=false removes credentials", async () => {
    const configureTool = triggers.tools()[1];

    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok"),
    );

    // First enable
    await configureTool.execute({
      context: {
        type: "github.push",
        params: {},
        enabled: true,
        callbackUrl: "https://mesh.example.com/api/trigger-callback",
        callbackToken: "token-abc",
      },
      runtimeContext: {
        env: { MESH_REQUEST_CONTEXT: { connectionId: "conn-2" } },
        ctx: { waitUntil: () => {} },
      },
    });

    // Then disable
    await configureTool.execute({
      context: {
        type: "github.push",
        params: {},
        enabled: false,
      },
      runtimeContext: {
        env: { MESH_REQUEST_CONTEXT: { connectionId: "conn-2" } },
        ctx: { waitUntil: () => {} },
      },
    });

    // Notify should not call fetch (no credentials)
    triggers.notify("conn-2", "github.push", { foo: "bar" });
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("notify is a no-op when no credentials exist", () => {
    const consoleSpy = spyOn(console, "log").mockImplementation(() => {});
    triggers.notify("unknown-conn", "github.push", {});
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("No callback credentials"),
    );
    consoleSpy.mockRestore();
  });

  it("TRIGGER_CONFIGURE throws without connectionId", async () => {
    const configureTool = triggers.tools()[1];
    expect(
      configureTool.execute({
        context: { type: "github.push", params: {}, enabled: true },
        runtimeContext: {
          env: { MESH_REQUEST_CONTEXT: {} },
          ctx: { waitUntil: () => {} },
        },
      }),
    ).rejects.toThrow("Connection ID not available");
  });
});
