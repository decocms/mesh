/**
 * Decopilot Helper Functions
 *
 * Utility functions for request validation, context management, and tool conversion.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  jsonSchema,
  type JSONSchema7,
  type JSONValue,
  tool,
  type ToolSet,
  type UIMessageStreamWriter,
} from "ai";
import type { Context } from "hono";

import type { MeshContext, OrganizationScope } from "@/core/mesh-context";
import { HTTPException } from "hono/http-exception";
import { MCP_TOOL_CALL_TIMEOUT_MS } from "@/core/constants";
import { resolveArgsStorageRefs } from "./file-materializer";
import {
  MAX_RESULT_TOKENS,
  createOutputPreview,
  estimateJsonTokens,
} from "./built-in-tools/read-tool-output";

/**
 * Tool approval levels determine which tools require user approval before executing
 */
export type ToolApprovalLevel = "auto" | "readonly" | "plan";

/**
 * Determine if a tool needs approval based on approval level and readOnlyHint
 *
 * @param level - The approval level setting
 * @param readOnlyHint - Optional hint from MCP tool annotations
 * @returns true if the tool requires approval, false if auto-approved
 */
export function toolNeedsApproval(
  level: ToolApprovalLevel,
  readOnlyHint?: boolean,
): boolean | "hard-block" {
  if (level === "auto") return false;
  if (level === "plan") {
    // Hard block: non-read-only tools cannot run at all in plan mode
    if (readOnlyHint === true) return false;
    return "hard-block";
  }
  // "readonly": auto-approve only if explicitly marked readOnly
  return readOnlyHint !== true;
}

/**
 * Ensure organization context exists and matches route param
 */
export function ensureOrganization(
  c: Context<{ Variables: { meshContext: MeshContext } }>,
): OrganizationScope {
  const organization = c.get("meshContext").organization;
  if (!organization) {
    throw new Error("Organization context is required");
  }
  if ((organization.slug ?? organization.id) !== c.req.param("org")) {
    throw new Error("Organization mismatch");
  }
  return organization;
}

/**
 * Sanitize a tool name so it is accepted by all known LLM providers.
 *
 * Gemini is the strictest: must start with a letter or underscore, contain
 * only [a-zA-Z0-9_.\-:], and be at most 128 characters.
 */
export function sanitizeToolName(name: string): string {
  // Replace any character outside the allowed set with an underscore
  let safe = name.replace(/[^a-zA-Z0-9_.\-:]/g, "_");
  // Ensure it starts with a letter or underscore
  if (safe.length === 0 || !/^[a-zA-Z_]/.test(safe)) {
    safe = `_${safe}`;
  }
  // Truncate to 128 characters
  if (safe.length > 128) {
    safe = safe.slice(0, 128);
  }
  return safe;
}

/**
 * Build a mapping from original tool names to unique, provider-safe names.
 * Handles collisions by appending `_2`, `_3`, etc., and ensures the
 * suffixed result still fits within the 128-character limit.
 */
export function buildSanitizedNameMap(names: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const usedNames = new Set<string>();
  for (const name of names) {
    let safeName = sanitizeToolName(name);
    if (usedNames.has(safeName)) {
      // Reserve room for the suffix (up to "_999") within the 128-char limit
      const maxBase = 128 - 4; // "_" + up to 3 digits
      const base =
        safeName.length > maxBase ? safeName.slice(0, maxBase) : safeName;
      let i = 2;
      while (usedNames.has(`${base}_${i}`)) i++;
      safeName = `${base}_${i}`;
    }
    usedNames.add(safeName);
    map.set(name, safeName);
  }
  return map;
}

/**
 * Convert MCP tools to AI SDK ToolSet
 */
/**
 * Check if a tool should be visible to the LLM based on MCP Apps visibility metadata.
 * Default (no visibility set) = visible to model.
 */
export function isToolVisibleToModel(tool: {
  _meta?: Record<string, unknown>;
}): boolean {
  const ui = tool._meta?.ui as { visibility?: string | string[] } | undefined;
  const visibility = ui?.visibility;
  if (visibility == null) return true;
  if (typeof visibility === "string") return visibility === "model";
  if (Array.isArray(visibility)) return visibility.includes("model");
  return true;
}

export async function toolsFromMCP(
  client: Client,
  toolOutputMap: Map<string, string>,
  writer?: UIMessageStreamWriter,
  toolApprovalLevel: ToolApprovalLevel = "auto",
  options?: { disableOutputTruncation?: boolean; ctx?: MeshContext },
): Promise<{ tools: ToolSet; nameMap: Map<string, string> }> {
  const truncate = !options?.disableOutputTruncation;
  const meshCtx = options?.ctx;
  const list = await client.listTools();
  const visibleTools = list.tools.filter(isToolVisibleToModel);

  const nameMap = buildSanitizedNameMap(visibleTools.map((t) => t.name));
  const toolEntries = visibleTools.map((t) => {
    const { name, title, description, inputSchema, annotations, _meta } = t;
    const safeName = nameMap.get(name)!;

    return [
      safeName,
      tool<Record<string, unknown>, CallToolResult>({
        title: title ?? name,
        description,
        inputSchema: jsonSchema(inputSchema as JSONSchema7),
        outputSchema: undefined,
        needsApproval:
          toolNeedsApproval(toolApprovalLevel, annotations?.readOnlyHint) !==
          false,
        execute: async (input, callOptions) => {
          const startTime = performance.now();
          try {
            // Resolve any mesh-storage: URIs in tool arguments to fresh
            // presigned URLs before forwarding to the MCP client.
            const resolvedInput = meshCtx
              ? await resolveArgsStorageRefs(
                  input as Record<string, unknown>,
                  meshCtx,
                )
              : (input as Record<string, unknown>);
            const result = await client.callTool(
              {
                name: t.name,
                arguments: resolvedInput,
              },
              CallToolResultSchema,
              {
                signal: callOptions.abortSignal,
                timeout: MCP_TOOL_CALL_TIMEOUT_MS,
              },
            );
            return result as unknown as CallToolResult;
          } finally {
            if (writer) {
              const latencyMs = performance.now() - startTime;
              writer.write({
                type: "data-tool-metadata",
                id: callOptions.toolCallId,
                data: {
                  _meta,
                  annotations,
                  latencyMs,
                },
              });
            }
          }
        },
        toModelOutput: async ({ output, toolCallId }) => {
          if (truncate) {
            const tokens = estimateJsonTokens(
              output.structuredContent ?? output.content,
            );
            if (tokens > MAX_RESULT_TOKENS) {
              const value = output.structuredContent ?? output.content;
              let raw: string;
              try {
                raw = JSON.stringify(value, null, 2);
              } catch {
                raw = String(value);
              }
              toolOutputMap.set(toolCallId, raw);
              const preview = createOutputPreview(raw);

              return {
                type: "text",
                value: `Tool call ${toolCallId} output is too long to display (${tokens} tokens), use the read_tool_output tool.\n\nPreview:\n${preview}`,
              };
            }
          }
          if (output.isError) {
            const textContent = output.content
              .map((c) => (c.type === "text" ? c.text : null))
              .filter(Boolean)
              .join("\n");
            return {
              type: "error-text",
              value: textContent || "Unknown error",
            };
          }
          if ("structuredContent" in output) {
            return {
              type: "json",
              value: output.structuredContent as JSONValue,
            };
          }
          // Convert MCP content parts to text for the model output.
          // "content" is not a valid AI SDK output type — using it causes
          // downstream providers (e.g. xAI) to reject the serialized prompt
          // with a 422 deserialization error on the next step.
          const textValue = output.content
            .map((c) => {
              if (c.type === "text") return c.text;
              return JSON.stringify(c);
            })
            .join("\n");
          return { type: "text", value: textValue };
        },
      }),
    ];
  });

  return { tools: Object.fromEntries(toolEntries), nameMap };
}

/**
 * Validate that a thread exists and belongs to the org.
 * Does NOT enforce ownership — any authenticated org member can access.
 * Use this for read-only / observability endpoints (e.g. attach).
 */
export async function validateThreadAccess(
  c: Context<{ Variables: { meshContext: MeshContext } }>,
) {
  const ctx = c.get("meshContext");
  const userId = ctx.auth?.user?.id;
  if (!userId) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  const organization = ensureOrganization(c);
  const taskId = c.req.param("threadId");
  if (!taskId) {
    throw new HTTPException(400, { message: "Missing thread ID" });
  }
  if (/[.*>\s]/.test(taskId)) {
    throw new HTTPException(400, { message: "Invalid thread ID" });
  }
  const thread = await ctx.storage.threads.get(taskId);
  if (!thread) {
    throw new HTTPException(404, { message: "Thread not found" });
  }
  return { ctx, organization, thread, taskId, userId };
}

/**
 * Validate that the caller owns the thread and it belongs to the org.
 * Use this for mutating endpoints (e.g. cancel) where only the owner
 * should be allowed to act.
 */
export async function validateThreadOwnership(
  c: Context<{ Variables: { meshContext: MeshContext } }>,
) {
  const result = await validateThreadAccess(c);
  if (result.thread.created_by !== result.userId) {
    throw new HTTPException(403, { message: "Not authorized" });
  }
  return result;
}
