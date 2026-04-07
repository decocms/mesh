/**
 * Prefix patterns stripped from tool/prompt names before display.
 * - MCP client prefix: "mcp__cms__toolName" → "toolName"
 * - Gateway slug prefix: "conn-abc123_toolName" → "toolName"
 */
export const TOOL_NAMESPACE_PREFIXES: RegExp[] = [
  /^mcp__[a-zA-Z0-9_-]+__/,
  /^[a-z0-9-]+_/,
];
