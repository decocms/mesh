import type { SubtaskResultMeta } from "@/api/routes/decopilot/built-in-tools/subtask";
import type { ToolDefinition } from "@decocms/mesh-sdk";
import type { ChatMessage } from "../types.ts";

type MessagePart = ChatMessage["parts"][number];
type ReasoningPart = Extract<MessagePart, { type: "reasoning" }>;

function isReasoningPart(part: MessagePart): part is ReasoningPart {
  return part.type === "reasoning";
}

export interface DataParts {
  toolAnnotations: Map<string, NonNullable<ToolDefinition["annotations"]>>;
  subtaskResult: Map<string, SubtaskResultMeta>;
}

export function useFilterParts(message: ChatMessage | null) {
  // Single pass through parts array to extract reasoning and data parts
  const reasoningParts: ReasoningPart[] = [];
  const toolAnnotations = new Map<
    string,
    NonNullable<ToolDefinition["annotations"]>
  >();
  const subtaskResult = new Map<string, SubtaskResultMeta>();

  if (message) {
    for (const p of message.parts) {
      // Extract reasoning parts
      if (isReasoningPart(p)) {
        reasoningParts.push(p);
        continue;
      }

      // Extract tool annotations
      if (p.type === "data-tool-annotations" && "id" in p) {
        toolAnnotations.set(
          (p as { id: string }).id,
          (
            p as {
              data: { annotations: NonNullable<ToolDefinition["annotations"]> };
            }
          ).data.annotations,
        );
        continue;
      }

      // Extract subtask results
      if (p.type === "data-subtask-result" && "id" in p) {
        subtaskResult.set(
          (p as { id: string }).id,
          (p as { data: SubtaskResultMeta }).data,
        );
      }
    }
  }

  const dataParts: DataParts = { toolAnnotations, subtaskResult };

  return { reasoningParts, dataParts };
}
