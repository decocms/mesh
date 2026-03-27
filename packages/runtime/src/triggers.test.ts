import { describe, expect, it, spyOn } from "bun:test";
import { z } from "zod";
import { createTriggers } from "./triggers.ts";

// biome-ignore lint: test mocks don't need full type compliance
const mockCtx = (connectionId?: string) =>
  ({
    env: connectionId
      ? { MESH_REQUEST_CONTEXT: { connectionId } }
      : { MESH_REQUEST_CONTEXT: {} },
    ctx: { waitUntil: () => {} },
  }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any

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
      runtimeContext: mockCtx(),
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

  it("TRIGGER_LIST includes enum values from z.enum params", async () => {
    const enumTriggers = createTriggers([
      {
        type: "test.event",
        description: "Test",
        params: z.object({
          action: z.enum(["opened", "closed", "merged"]).describe("PR action"),
        }),
      },
    ]);
    const listTool = enumTriggers.tools()[0];
    const result = (await listTool.execute({
      context: {},
      runtimeContext: mockCtx(),
    })) as {
      triggers: Array<{ paramsSchema: Record<string, { enum?: string[] }> }>;
    };
    expect(result.triggers[0].paramsSchema.action.enum).toEqual([
      "opened",
      "closed",
      "merged",
    ]);
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
      runtimeContext: mockCtx("conn-1"),
    });

    // Notify should POST to the callback URL
    triggers.notify("conn-1", "github.push", {
      repository: { full_name: "owner/repo" },
    });

    // Wait for the fire-and-forget fetch
    await new Promise((r) => setTimeout(r, 50));

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

  it("TRIGGER_CONFIGURE with enabled=false keeps credentials (Mesh manages lifecycle)", async () => {
    const configureTool = triggers.tools()[1];

    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", { status: 202 }),
    );

    // Enable with credentials
    await configureTool.execute({
      context: {
        type: "github.push",
        params: {},
        enabled: true,
        callbackUrl: "https://mesh.example.com/api/trigger-callback",
        callbackToken: "token-abc",
      },
      runtimeContext: mockCtx("conn-2"),
    });

    // Disable a trigger type — credentials should persist for other trigger types
    await configureTool.execute({
      context: {
        type: "github.push",
        params: {},
        enabled: false,
      },
      runtimeContext: mockCtx("conn-2"),
    });

    // Notify should still deliver because credentials are connection-level
    triggers.notify("conn-2", "github.push", { foo: "bar" });
    await new Promise((r) => setTimeout(r, 50));

    expect(fetchSpy).toHaveBeenCalled();

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

  it("notify logs error on non-2xx response", async () => {
    const configureTool = triggers.tools()[1];
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Unauthorized", { status: 401, statusText: "Unauthorized" }),
    );
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});

    // Ensure credentials exist (reuse from prior test state or set up fresh)
    await configureTool.execute({
      context: {
        type: "github.push",
        params: {},
        enabled: true,
        callbackUrl: "https://mesh.example.com/api/trigger-callback",
        callbackToken: "token-err",
      },
      runtimeContext: mockCtx("conn-err"),
    });

    fetchSpy.mockResolvedValue(
      new Response("Unauthorized", { status: 401, statusText: "Unauthorized" }),
    );

    triggers.notify("conn-err", "github.push", {});
    await new Promise((r) => setTimeout(r, 50));

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Callback delivery failed"),
    );

    fetchSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("TRIGGER_CONFIGURE throws without connectionId", async () => {
    const configureTool = triggers.tools()[1];
    expect(
      configureTool.execute({
        context: { type: "github.push", params: {}, enabled: true },
        runtimeContext: mockCtx(),
      }),
    ).rejects.toThrow("Connection ID not available");
  });
});
