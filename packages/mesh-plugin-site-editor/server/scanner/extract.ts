/**
 * Extract - In-Memory ts-morph Project from MCP Files
 *
 * Reads source files through an MCP proxy (LIST_FILES, READ_FILE) and creates
 * an in-memory ts-morph Project for analysis. No direct filesystem access needed.
 */

import {
  type CompilerOptions,
  ModuleKind,
  ModuleResolutionKind,
  Project,
  ScriptTarget,
  ts,
} from "ts-morph";

/**
 * MCP proxy interface matching the pattern used by server tools.
 * The proxy is obtained via `ctx.createMCPProxy(connectionId)`.
 */
export interface MCPProxy {
  callTool(args: {
    name: string;
    arguments: Record<string, unknown>;
  }): Promise<{
    content?: Array<{ text?: string }>;
    isError?: boolean;
  }>;
  close?(): Promise<void>;
}

const COMPILER_OPTIONS: CompilerOptions = {
  target: ScriptTarget.ES2020,
  jsx: ts.JsxEmit.ReactJSX,
  module: ModuleKind.ESNext,
  moduleResolution: ModuleResolutionKind.Bundler,
  strict: true,
  skipLibCheck: true,
  skipDefaultLibCheck: true,
};

/**
 * Create an in-memory ts-morph Project populated with source files read through MCP.
 *
 * @param proxy - MCP proxy for calling LIST_FILES and READ_FILE
 * @param patterns - Directory prefixes to scan (e.g., ["sections/", "components/"])
 * @returns Populated ts-morph Project
 */
export async function createProjectFromMCP(
  proxy: MCPProxy,
  patterns: string[],
): Promise<Project> {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: COMPILER_OPTIONS,
  });

  for (const pattern of patterns) {
    try {
      const listResult = await proxy.callTool({
        name: "LIST_FILES",
        arguments: { prefix: pattern },
      });

      const listContent = listResult.content?.[0]?.text;
      if (!listContent) continue;

      let fileList: { files?: Array<{ path: string }>; count?: number };
      try {
        fileList = JSON.parse(listContent);
      } catch {
        continue;
      }

      if (!fileList.files || fileList.files.length === 0) continue;

      for (const file of fileList.files) {
        if (!file.path.endsWith(".ts") && !file.path.endsWith(".tsx")) {
          continue;
        }

        try {
          const readResult = await proxy.callTool({
            name: "READ_FILE",
            arguments: { path: file.path },
          });

          const content = readResult.content?.[0]?.text;
          if (!content) continue;

          // Normalize path to start with / for ts-morph in-memory FS
          const normalizedPath = file.path.startsWith("/")
            ? file.path
            : `/${file.path}`;
          project.createSourceFile(normalizedPath, content);
        } catch {
          // Skip unreadable files -- log would go here in production
          continue;
        }
      }
    } catch {
      // Skip patterns that fail to list -- non-fatal
      continue;
    }
  }

  return project;
}
