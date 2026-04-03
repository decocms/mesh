import type { IClient } from "../client-like.ts";
import { runCode, type RunCodeResult } from "./run-code.ts";

export interface RunCodeWithToolsOptions {
  code: string;
  client: IClient;
  timeoutMs?: number;
  memoryLimitBytes?: number;
  stackSizeBytes?: number;
}

export async function runCodeWithTools({
  code,
  client,
  timeoutMs = 30_000,
  memoryLimitBytes,
  stackSizeBytes,
}: RunCodeWithToolsOptions): Promise<RunCodeResult> {
  const { tools: toolList } = await client.listTools();

  const tools: Record<
    string,
    (args: Record<string, unknown>) => Promise<unknown>
  > = Object.create(null);

  for (const tool of toolList) {
    tools[tool.name] = async (args: Record<string, unknown>) => {
      const result = await client.callTool({
        name: tool.name,
        arguments: args,
      });
      if ("content" in result && Array.isArray(result.content)) {
        const textParts = result.content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text);
        const text = textParts.join("\n");
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      }
      return result;
    };
  }

  return runCode({ tools, code, timeoutMs, memoryLimitBytes, stackSizeBytes });
}
