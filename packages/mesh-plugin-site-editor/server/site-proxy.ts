/**
 * Site Proxy
 *
 * Wraps an MCP proxy with SITE_BINDING awareness so server-side tools
 * can call canonical names (LIST_FILES, READ_FILE, PUT_FILE) even when
 * the connection only exposes aliases (list_directory, read_file, write_file).
 *
 * Also resolves relative paths to absolute paths using the MCP's allowed
 * directory, since the filesystem MCP resolves relative paths against its
 * CWD (which may differ from the allowed directory).
 *
 * Input adaptation:
 * - LIST_FILES { prefix } → list_directory { path: "<root>/<prefix>" }
 * - READ_FILE { path } → read_file { path: "<root>/<path>" }
 * - PUT_FILE { path, content } → write_file { path: "<root>/<path>", content }
 *
 * Output adaptation:
 * - list_directory text ("[FILE] x\n[DIR] y") → LIST_FILES JSON ({ files, count })
 */

import { SITE_BINDING } from "@decocms/bindings/site";

type MCPProxy = {
  callTool: (args: {
    name: string;
    arguments?: Record<string, unknown>;
  }) => Promise<{
    isError?: boolean;
    content?: Array<{ type?: string; text?: string }>;
    structuredContent?: unknown;
  }>;
  listTools: () => Promise<{
    tools: Array<{ name: string; description?: string }>;
  }>;
  close?: () => Promise<void>;
};

export type SiteProxy = Pick<MCPProxy, "callTool" | "close">;

/**
 * Extract the first allowed directory from the filesystem MCP.
 * Returns null if the tool isn't available or returns unexpected format.
 */
async function discoverRootDir(
  proxy: MCPProxy,
  toolNames: Set<string>,
): Promise<string | null> {
  if (!toolNames.has("list_allowed_directories")) return null;
  try {
    const result = await proxy.callTool({
      name: "list_allowed_directories",
      arguments: {},
    });
    // structuredContent.content or content[0].text, format: "Allowed directories:\n/path/to/dir"
    const text =
      (typeof (result.structuredContent as Record<string, unknown>)?.content ===
      "string"
        ? (result.structuredContent as Record<string, string>).content
        : null) ??
      result.content?.[0]?.text ??
      "";
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    // Find first line that looks like an absolute path
    return lines.find((l) => l.startsWith("/")) ?? null;
  } catch {
    return null;
  }
}

/**
 * Make a relative path absolute by prepending the root directory.
 */
function toAbsolute(rootDir: string | null, relativePath: string): string {
  if (!rootDir || relativePath.startsWith("/")) return relativePath;
  return `${rootDir.replace(/\/$/, "")}/${relativePath}`;
}

/**
 * Wraps an MCP proxy so canonical SITE_BINDING tool names
 * are resolved to the actual tool names on the connection.
 */
export async function createSiteProxy(proxy: MCPProxy): Promise<SiteProxy> {
  const { tools } = await proxy.listTools();
  const toolNames = new Set(tools.map((t) => t.name));

  // Build canonical → actual name map
  const nameMap: Record<string, string> = {};
  for (const binder of SITE_BINDING) {
    const canonical = binder.name;
    if (toolNames.has(canonical)) continue;
    const alias = (binder as { aliases?: string[] }).aliases?.find(
      (a: string) => toolNames.has(a),
    );
    if (alias) {
      nameMap[canonical] = alias;
    }
  }

  // Discover root directory for resolving relative paths
  const rootDir =
    Object.keys(nameMap).length > 0
      ? await discoverRootDir(proxy, toolNames)
      : null;

  return {
    callTool: async (args) => {
      const actualName = nameMap[args.name];
      if (!actualName) {
        return proxy.callTool(args);
      }

      const originalArgs = args.arguments ?? {};

      // Adapt input based on canonical tool name
      let adaptedArgs: Record<string, unknown>;
      switch (args.name) {
        case "LIST_FILES":
          adaptedArgs = {
            path: toAbsolute(rootDir, (originalArgs.prefix as string) || "."),
          };
          break;
        case "READ_FILE":
          adaptedArgs = {
            path: toAbsolute(rootDir, (originalArgs.path as string) || ""),
          };
          break;
        case "PUT_FILE":
          adaptedArgs = {
            path: toAbsolute(rootDir, (originalArgs.path as string) || ""),
            content: originalArgs.content,
          };
          break;
        default:
          adaptedArgs = originalArgs;
      }

      const result = await proxy.callTool({
        name: actualName,
        arguments: adaptedArgs,
      });

      // Adapt output for LIST_FILES (text lines → structured JSON)
      // list_directory may return structuredContent.content (a string) or content[0].text
      if (args.name === "LIST_FILES") {
        const text =
          (typeof (result.structuredContent as Record<string, unknown>)
            ?.content === "string"
            ? (result.structuredContent as Record<string, string>).content
            : null) ??
          result.content?.[0]?.text ??
          "";
        const lines = text
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        const prefix = (originalArgs.prefix as string) ?? "";
        const files = lines
          .filter((l) => l.startsWith("[FILE]"))
          .map((l) => {
            const name = l.replace("[FILE]", "").trim();
            const fullPath =
              prefix && prefix !== "."
                ? `${prefix.replace(/\/$/, "")}/${name}`
                : name;
            return { path: fullPath, sizeInBytes: 0, mtime: 0 };
          });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ files, count: files.length }),
            },
          ],
        };
      }

      return result;
    },
    close: proxy.close,
  };
}
