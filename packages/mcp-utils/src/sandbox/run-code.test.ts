import { describe, it, expect } from "bun:test";
import { runCode } from "./run-code.ts";
import type { RunCodeOptions, ToolHandler } from "./run-code.ts";

describe("runCode", () => {
  describe("basic code execution", () => {
    it("returns the value from the default export function", async () => {
      const result = await runCode({
        tools: {},
        code: `export default async (tools) => { return 42; }`,
        timeoutMs: 5000,
      });

      expect(result.error).toBeUndefined();
      expect(result.returnValue).toBe(42);
    });

    it("returns object values", async () => {
      const result = await runCode({
        tools: {},
        code: `export default async (tools) => { return { hello: "world", n: 123 }; }`,
        timeoutMs: 5000,
      });

      expect(result.error).toBeUndefined();
      expect(result.returnValue).toEqual({ hello: "world", n: 123 });
    });

    it("returns null when function returns nothing", async () => {
      const result = await runCode({
        tools: {},
        code: `export default async (tools) => {}`,
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
        tools: {},
        code: `export default async (tools) => {
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
        tools: {},
        code: `export default async (tools) => {
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

  describe("tool handler invocation", () => {
    it("calls tool handlers from sandbox code", async () => {
      const myTool: ToolHandler = async (args) => {
        return { sum: (args.a as number) + (args.b as number) };
      };

      const result = await runCode({
        tools: { myTool },
        code: `export default async (tools) => {
          const result = await tools.myTool({ a: 3, b: 4 });
          return result;
        }`,
        timeoutMs: 5000,
      });

      expect(result.error).toBeUndefined();
      expect(result.returnValue).toEqual({ sum: 7 });
    });

    it("handles tool handler errors gracefully", async () => {
      const failingTool: ToolHandler = async () => {
        throw new Error("tool failed");
      };

      const result = await runCode({
        tools: { failingTool },
        code: `export default async (tools) => {
          try {
            await tools.failingTool({});
          } catch (e) {
            return "caught error";
          }
        }`,
        timeoutMs: 5000,
      });

      expect(result.error).toBeUndefined();
      expect(result.returnValue).toBe("caught error");
    });
  });

  describe("timeout enforcement", () => {
    it("returns error when code exceeds timeout", async () => {
      const result = await runCode({
        tools: {},
        code: `export default async (tools) => {
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
        tools: {},
        code: `const value = 42; export default value;`,
        timeoutMs: 5000,
      });

      expect(result.error).toBeDefined();
      expect(result.error).toContain("must export default a function");
    });

    it("returns error for object default export", async () => {
      const result = await runCode({
        tools: {},
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
        tools: {},
        code: `export default async (tools) => "ok";`,
        timeoutMs: 5000,
        memoryLimitBytes: 16 * 1024 * 1024,
      });

      expect(result.error).toBeUndefined();
      expect(result.returnValue).toBe("ok");
    });

    it("accepts custom stackSizeBytes without error", async () => {
      const result = await runCode({
        tools: {},
        code: `export default async (tools) => "ok";`,
        timeoutMs: 5000,
        stackSizeBytes: 256 * 1024,
      });

      expect(result.error).toBeUndefined();
      expect(result.returnValue).toBe("ok");
    });

    it("uses defaults when limits are not provided", async () => {
      const result = await runCode({
        tools: {},
        code: `export default async (tools) => "ok";`,
        timeoutMs: 5000,
      });

      expect(result.error).toBeUndefined();
      expect(result.returnValue).toBe("ok");
    });
  });

  describe("syntax errors", () => {
    it("returns error for invalid JavaScript", async () => {
      const result = await runCode({
        tools: {},
        code: `export default async (tools) => { invalid syntax here !!!`,
        timeoutMs: 5000,
      });

      expect(result.error).toBeDefined();
    });
  });
});
