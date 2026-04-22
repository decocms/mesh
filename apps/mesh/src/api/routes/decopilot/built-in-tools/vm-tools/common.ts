/**
 * Shared behavior for both VM tool transports: output truncation into the
 * toolOutputMap (so large grep/read/bash results don't blow context), and a
 * stable error shape for transport failures.
 */

import {
  MAX_RESULT_TOKENS,
  createOutputPreview,
  estimateJsonTokens,
} from "../read-tool-output";

/**
 * When the result exceeds MAX_RESULT_TOKENS, stash it in `toolOutputMap`
 * keyed by a fresh id and return a preview pointer. The LLM then calls
 * `read_tool_output` with the id to extract what it needs.
 */
export function maybeTruncate(
  result: unknown,
  toolOutputMap: Map<string, string>,
): unknown {
  let serialized: string;
  try {
    serialized =
      typeof result === "string" ? result : JSON.stringify(result, null, 2);
  } catch {
    serialized = String(result);
  }
  const tokenCount = estimateJsonTokens(serialized);
  if (tokenCount > MAX_RESULT_TOKENS) {
    const toolCallId = `vm_${Date.now()}`;
    toolOutputMap.set(toolCallId, serialized);
    const preview = createOutputPreview(serialized);
    return {
      truncated: true,
      message: `Output too large (${tokenCount} tokens). Use read_tool_output with tool_call_id "${toolCallId}" to extract specific data.`,
      preview,
    };
  }
  return result;
}
