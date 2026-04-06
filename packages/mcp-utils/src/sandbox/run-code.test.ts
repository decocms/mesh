import { describe, it, expect } from "bun:test";
import { runCode } from "./run-code.ts";
import type { IClient } from "../client-like.ts";

function createMockClient(
  overrides?: Partial<Pick<IClient, "callTool" | "listTools">>,
): IClient {
  return {
    callTool: overrides?.callTool ?? (async () => ({ content: [] })),
    listTools: overrides?.listTools ?? (async () => ({ tools: [] })),
    listResources: async () => ({ resources: [] }),
    readResource: async () => ({ contents: [] }),
    listResourceTemplates: async () => ({ resourceTemplates: [] }),
    listPrompts: async () => ({ prompts: [] }),
    getPrompt: async () => ({ messages: [] }),
    getServerCapabilities: () => undefined,
    getInstructions: () => undefined,
    close: async () => {},
  } as unknown as IClient;
}

describe("runCode", () => {
  describe("basic code execution", () => {
    it("returns the value from the default export function", async () => {
      const result = await runCode({
        client: createMockClient(),
        code: `export default async (client) => { return 42; }`,
        timeoutMs: 5000,
      });

      expect(result.error).toBeUndefined();
      expect(result.returnValue).toBe(42);
    });

    it("returns object values", async () => {
      const result = await runCode({
        client: createMockClient(),
        code: `export default async (client) => { return { hello: "world", n: 123 }; }`,
        timeoutMs: 5000,
      });

      expect(result.error).toBeUndefined();
      expect(result.returnValue).toEqual({ hello: "world", n: 123 });
    });

    it("returns null when function returns nothing", async () => {
      const result = await runCode({
        client: createMockClient(),
        code: `export default async (client) => {}`,
        timeoutMs: 5000,
      });

      expect(result.error).toBeUndefined();
      // undefined becomes null in QuickJS dump
      expect(result.returnValue).toBeUndefined();
    });
  });

  describe("console log capture", () => {
    it("captures console.log output", async () => {
      const result = await runCode({
        client: createMockClient(),
        code: `export default async (client) => {
          console.log("hello");
          console.log("world");
          return "done";
        }`,
        timeoutMs: 5000,
      });

      expect(result.error).toBeUndefined();
      expect(result.consoleLogs).toHaveLength(2);
      expect(result.consoleLogs[0]).toEqual({
        type: "log",
        content: "hello",
      });
      expect(result.consoleLogs[1]).toEqual({
        type: "log",
        content: "world",
      });
    });

    it("captures console.warn and console.error", async () => {
      const result = await runCode({
        client: createMockClient(),
        code: `export default async (client) => {
          console.warn("warning");
          console.error("error");
          return true;
        }`,
        timeoutMs: 5000,
      });

      expect(result.error).toBeUndefined();
      expect(result.consoleLogs).toHaveLength(2);
      expect(result.consoleLogs[0].type).toBe("warn");
      expect(result.consoleLogs[1].type).toBe("error");
    });
  });

  describe("client method invocation", () => {
    it("calls client.callTool from sandbox code", async () => {
      const client = createMockClient({
        callTool: async (params) => ({
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                sum:
                  (params.arguments?.a as number) +
                  (params.arguments?.b as number),
              }),
            },
          ],
        }),
      });

      const result = await runCode({
        client,
        code: `export default async (client) => {
          const result = await client.callTool({ name: "myTool", arguments: { a: 3, b: 4 } });
          return result;
        }`,
        timeoutMs: 5000,
      });

      expect(result.error).toBeUndefined();
      expect(result.returnValue).toEqual({
        content: [{ type: "text", text: '{"sum":7}' }],
      });
    });

    it("calls client.listTools from sandbox code", async () => {
      const client = createMockClient({
        listTools: async () => ({
          tools: [
            {
              name: "tool_a",
              description: "Tool A",
              inputSchema: { type: "object" as const, properties: {} },
            },
          ],
        }),
      });

      const result = await runCode({
        client,
        code: `export default async (client) => {
          const { tools } = await client.listTools();
          return tools.map(t => t.name);
        }`,
        timeoutMs: 5000,
      });

      expect(result.error).toBeUndefined();
      expect(result.returnValue).toEqual(["tool_a"]);
    });

    it("handles client method errors gracefully", async () => {
      const client = createMockClient({
        callTool: async () => {
          throw new Error("tool failed");
        },
      });

      const result = await runCode({
        client,
        code: `export default async (client) => {
          try {
            await client.callTool({ name: "failingTool", arguments: {} });
          } catch (e) {
            return "caught error";
          }
        }`,
        timeoutMs: 5000,
      });

      expect(result.error).toBeUndefined();
      expect(result.returnValue).toBe("caught error");
    });

    it("propagates error for unknown tool calls", async () => {
      const client = createMockClient({
        callTool: async (params) => {
          throw new Error(`Tool "${params.name}" not found`);
        },
      });

      const result = await runCode({
        client,
        code: `export default async (client) => {
          const result = await client.callTool({ name: "UNKNOWN_TOOL", arguments: {} });
          return result;
        }`,
        timeoutMs: 5000,
      });

      expect(result.error).toBeDefined();
      expect(result.error).toContain("UNKNOWN_TOOL");
    });
  });

  describe("timeout enforcement", () => {
    it("returns error when code exceeds timeout", async () => {
      const result = await runCode({
        client: createMockClient(),
        code: `export default async (client) => {
          let x = 0;
          while(true) { x++; }
          return x;
        }`,
        timeoutMs: 200,
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("non-function default export", () => {
    it("returns error when default export is not a function", async () => {
      const result = await runCode({
        client: createMockClient(),
        code: `const value = 42; export default value;`,
        timeoutMs: 5000,
      });

      expect(result.error).toBeDefined();
      expect(result.error).toContain("must export default a function");
    });

    it("returns error for object default export", async () => {
      const result = await runCode({
        client: createMockClient(),
        code: `export default { key: "value" };`,
        timeoutMs: 5000,
      });

      expect(result.error).toBeDefined();
      expect(result.error).toContain("must export default a function");
    });
  });

  describe("memory/stack limits are configurable", () => {
    it("accepts custom memoryLimitBytes without error", async () => {
      const result = await runCode({
        client: createMockClient(),
        code: `export default async (client) => "ok";`,
        timeoutMs: 5000,
        memoryLimitBytes: 16 * 1024 * 1024,
      });

      expect(result.error).toBeUndefined();
      expect(result.returnValue).toBe("ok");
    });

    it("accepts custom stackSizeBytes without error", async () => {
      const result = await runCode({
        client: createMockClient(),
        code: `export default async (client) => "ok";`,
        timeoutMs: 5000,
        stackSizeBytes: 256 * 1024,
      });

      expect(result.error).toBeUndefined();
      expect(result.returnValue).toBe("ok");
    });

    it("uses defaults when limits are not provided", async () => {
      const result = await runCode({
        client: createMockClient(),
        code: `export default async (client) => "ok";`,
        timeoutMs: 5000,
      });

      expect(result.error).toBeUndefined();
      expect(result.returnValue).toBe("ok");
    });
  });

  describe("syntax errors", () => {
    it("returns error for invalid JavaScript", async () => {
      const result = await runCode({
        client: createMockClient(),
        code: `export default async (client) => { invalid syntax here !!!`,
        timeoutMs: 5000,
      });

      expect(result.error).toBeDefined();
    });
  });
});
