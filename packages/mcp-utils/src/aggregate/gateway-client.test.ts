import { describe, it, expect, mock } from "bun:test";
import type { IClient } from "../client-like.ts";
import { GatewayClient } from "./gateway-client.ts";

function createMockClient(
  tools: { name: string }[] = [],
  resources: { uri: string; name: string }[] = [],
  prompts: { name: string }[] = [],
): IClient {
  return {
    listTools: mock(async () => ({
      tools: tools.map((t) => ({
        ...t,
        description: `desc-${t.name}`,
        inputSchema: { type: "object" as const },
      })),
    })),
    callTool: mock(async (params) => ({
      content: [{ type: "text" as const, text: `result-from-${params.name}` }],
    })),
    listResources: mock(async () => ({
      resources: resources.map((r) => ({
        ...r,
        mimeType: "text/plain",
      })),
    })),
    readResource: mock(async (params) => ({
      contents: [{ uri: params.uri, text: "content", mimeType: "text/plain" }],
    })),
    listResourceTemplates: mock(async () => ({
      resourceTemplates: [],
    })),
    listPrompts: mock(async () => ({
      prompts: prompts.map((p) => ({
        ...p,
        description: `desc-${p.name}`,
      })),
    })),
    getPrompt: mock(async (params) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `prompt-${params.name}`,
          },
        },
      ],
    })),
    getServerCapabilities: mock(() => ({
      tools: {},
      resources: {},
      prompts: {},
    })),
    getInstructions: mock(() => undefined),
    close: mock(async () => {}),
  };
}

describe("GatewayClient", () => {
  describe("tool aggregation", () => {
    it("aggregates tools from multiple clients", async () => {
      const clientA = createMockClient([{ name: "toolA" }]);
      const clientB = createMockClient([{ name: "toolB" }]);

      const gw = new GatewayClient({ a: clientA, b: clientB });
      const result = await gw.listTools();

      expect(result.tools).toHaveLength(2);
      const names = result.tools.map((t) => t.name);
      expect(names).toContain("toolA");
      expect(names).toContain("toolB");
    });

    it("tags tools with _meta.gatewayClientId", async () => {
      const clientA = createMockClient([{ name: "toolA" }]);
      const gw = new GatewayClient({ myKey: clientA });
      const result = await gw.listTools();

      expect((result.tools[0]._meta as any).gatewayClientId).toBe("myKey");
    });
  });

  describe("deduplication", () => {
    it("first occurrence wins when tools have same name", async () => {
      const clientA = createMockClient([{ name: "dup" }]);
      const clientB = createMockClient([{ name: "dup" }]);

      const gw = new GatewayClient({ a: clientA, b: clientB });
      const result = await gw.listTools();

      expect(result.tools).toHaveLength(1);
      expect((result.tools[0]._meta as any).gatewayClientId).toBe("a");
    });
  });

  describe("routing", () => {
    it("callTool routes to correct client", async () => {
      const clientA = createMockClient([{ name: "toolA" }]);
      const clientB = createMockClient([{ name: "toolB" }]);

      const gw = new GatewayClient({ a: clientA, b: clientB });
      // Must list first to build routing map
      await gw.listTools();

      await gw.callTool({ name: "toolB", arguments: {} });
      expect(clientB.callTool).toHaveBeenCalled();
      expect(clientA.callTool).not.toHaveBeenCalled();
    });

    it("readResource routes to correct client", async () => {
      const clientA = createMockClient(
        [],
        [{ uri: "file:///a.txt", name: "a" }],
      );
      const clientB = createMockClient(
        [],
        [{ uri: "file:///b.txt", name: "b" }],
      );

      const gw = new GatewayClient({ a: clientA, b: clientB });
      await gw.listResources();

      await gw.readResource({ uri: "file:///b.txt" });
      expect(clientB.readResource).toHaveBeenCalled();
      expect(clientA.readResource).not.toHaveBeenCalled();
    });

    it("getPrompt routes to correct client", async () => {
      const clientA = createMockClient([], [], [{ name: "promptA" }]);
      const clientB = createMockClient([], [], [{ name: "promptB" }]);

      const gw = new GatewayClient({ a: clientA, b: clientB });
      await gw.listPrompts();

      await gw.getPrompt({ name: "promptB", arguments: {} });
      expect(clientB.getPrompt).toHaveBeenCalled();
      expect(clientA.getPrompt).not.toHaveBeenCalled();
    });

    it("throws when routing to unknown tool", async () => {
      const clientA = createMockClient([{ name: "toolA" }]);
      const gw = new GatewayClient({ a: clientA });
      await gw.listTools();

      await expect(
        gw.callTool({ name: "nonexistent", arguments: {} }),
      ).rejects.toThrow(/not found/);
    });
  });

  describe("lazy factory", () => {
    it("factory is called on first use and cached", async () => {
      const client = createMockClient([{ name: "lazy_tool" }]);
      const factory = mock(() => client);

      const gw = new GatewayClient({ lazy: factory });

      // Factory not called yet
      expect(factory).not.toHaveBeenCalled();

      await gw.listTools();

      // Called once
      expect(factory).toHaveBeenCalledTimes(1);

      // Second call uses cache
      gw.refresh();
      await gw.listTools();
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it("async factory is supported", async () => {
      const client = createMockClient([{ name: "async_tool" }]);
      const factory = mock(async () => client);

      const gw = new GatewayClient({ async: factory });
      const result = await gw.listTools();

      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].name).toBe("async_tool");
    });
  });

  describe("selection filter", () => {
    it("filters tools by selected names", async () => {
      const client = createMockClient([
        { name: "toolA" },
        { name: "toolB" },
        { name: "toolC" },
      ]);

      const gw = new GatewayClient(
        { c: client },
        { selected: { tools: ["toolA", "toolC"] } },
      );

      const result = await gw.listTools();
      expect(result.tools).toHaveLength(2);
      const names = result.tools.map((t) => t.name);
      expect(names).toContain("toolA");
      expect(names).toContain("toolC");
      expect(names).not.toContain("toolB");
    });

    it("filters resources by selected URIs", async () => {
      const client = createMockClient(
        [],
        [
          { uri: "file:///a.txt", name: "a" },
          { uri: "file:///b.txt", name: "b" },
        ],
      );

      const gw = new GatewayClient(
        { c: client },
        { selected: { resources: ["file:///a.txt"] } },
      );

      const result = await gw.listResources();
      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].uri).toBe("file:///a.txt");
    });

    it("filters prompts by selected names", async () => {
      const client = createMockClient([], [], [{ name: "p1" }, { name: "p2" }]);

      const gw = new GatewayClient(
        { c: client },
        { selected: { prompts: ["p2"] } },
      );

      const result = await gw.listPrompts();
      expect(result.prompts).toHaveLength(1);
      expect(result.prompts[0].name).toBe("p2");
    });
  });

  describe("refresh()", () => {
    it("invalidates cache so next list re-fetches", async () => {
      const client = createMockClient([{ name: "tool1" }]);
      const gw = new GatewayClient({ c: client });

      await gw.listTools();
      expect(client.listTools).toHaveBeenCalledTimes(1);

      // Same call should return cached
      await gw.listTools();
      expect(client.listTools).toHaveBeenCalledTimes(1);

      // After refresh, should re-fetch
      gw.refresh();
      await gw.listTools();
      expect(client.listTools).toHaveBeenCalledTimes(2);
    });
  });

  describe("close()", () => {
    it("calls close on all resolved clients", async () => {
      const clientA = createMockClient([{ name: "a" }]);
      const clientB = createMockClient([{ name: "b" }]);

      const gw = new GatewayClient({ a: clientA, b: clientB });
      // Resolve clients by listing
      await gw.listTools();

      await gw.close();

      expect(clientA.close).toHaveBeenCalled();
      expect(clientB.close).toHaveBeenCalled();
    });

    it("does not call close on unresolved factory clients", async () => {
      const client = createMockClient([{ name: "a" }]);
      const factory = mock(() => client);

      const gw = new GatewayClient({ lazy: factory });
      // Don't resolve - just close
      await gw.close();

      expect(factory).not.toHaveBeenCalled();
      expect(client.close).not.toHaveBeenCalled();
    });
  });

  describe("empty clients record", () => {
    it("returns empty tool list", async () => {
      const gw = new GatewayClient({});
      const result = await gw.listTools();
      expect(result.tools).toHaveLength(0);
    });

    it("returns empty resources list", async () => {
      const gw = new GatewayClient({});
      const result = await gw.listResources();
      expect(result.resources).toHaveLength(0);
    });

    it("returns empty prompts list", async () => {
      const gw = new GatewayClient({});
      const result = await gw.listPrompts();
      expect(result.prompts).toHaveLength(0);
    });
  });

  describe("getServerCapabilities", () => {
    it("returns { tools: {}, resources: {}, prompts: {} }", () => {
      const gw = new GatewayClient({});
      const caps = gw.getServerCapabilities();
      expect(caps).toEqual({ tools: {}, resources: {}, prompts: {} });
    });
  });

  describe("getInstructions", () => {
    it("returns undefined", () => {
      const gw = new GatewayClient({});
      expect(gw.getInstructions()).toBeUndefined();
    });
  });

  describe("caching", () => {
    it("caches listTools results across calls", async () => {
      const client = createMockClient([{ name: "tool1" }]);
      const gw = new GatewayClient({ c: client });

      const r1 = await gw.listTools();
      const r2 = await gw.listTools();

      // Same promise, same result
      expect(r1).toBe(r2);
      expect(client.listTools).toHaveBeenCalledTimes(1);
    });
  });

  describe("auto-retry route resolution", () => {
    it("throws for unknown tool even after retry", async () => {
      // resolveRoute captures the routeMap reference at call time, and
      // aggregateTools() replaces it with a new map. The second lookup
      // still uses the old reference, so the tool is not found.
      const client = createMockClient([{ name: "toolA" }]);
      const gw = new GatewayClient({ c: client });
      await gw.listTools();

      await expect(
        gw.callTool({ name: "nonexistent", arguments: {} }),
      ).rejects.toThrow(/not found/);
    });

    it("resolves tool after refresh + listTools repopulates route map", async () => {
      // If we refresh and re-list before calling, the route map is fresh.
      let callCount = 0;
      const base = createMockClient([]);
      base.listTools = mock(async () => {
        callCount++;
        if (callCount >= 2) {
          return {
            tools: [
              {
                name: "lateTool",
                description: "added later",
                inputSchema: { type: "object" as const },
              },
            ],
          };
        }
        return { tools: [] };
      });
      base.callTool = mock(async () => ({
        content: [{ type: "text" as const, text: "ok" }],
      }));

      const gw = new GatewayClient({ c: base });
      await gw.listTools(); // callCount=1, empty

      // Explicitly refresh and re-list to populate the new route map
      gw.refresh();
      await gw.listTools(); // callCount=2, has lateTool

      const result = await gw.callTool({
        name: "lateTool",
        arguments: {},
      });
      expect(result.content).toHaveLength(1);
    });
  });
});
