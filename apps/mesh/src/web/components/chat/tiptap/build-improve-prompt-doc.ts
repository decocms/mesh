import type { JSONContent } from "@tiptap/core";

export interface ImprovePromptDocInput {
  managerAgentId: string;
  managerName: string;
  kind: "agent" | "automation";
  id: string;
  instructions: string;
}

/**
 * Build a tiptap document that, when sent through the chat, becomes:
 *   [@<Manager> chip][XML payload]
 *
 * The mention is shaped so derivePartsFromTiptapDoc emits the standard
 * `[DELEGATE TO AGENT: ...]` directive that Decopilot's SUBTASK tool
 * picks up. The XML payload carries the entity context for the manager.
 */
export function buildImprovePromptDoc(
  input: ImprovePromptDocInput,
): JSONContent {
  const { managerAgentId, managerName, kind, id, instructions } = input;

  const xmlPayload =
    `\n<task>improve_instructions</task>\n` +
    `<entity kind="${kind}" id="${id}" />\n` +
    `<current_instructions>\n${instructions}\n</current_instructions>`;

  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "mention",
            attrs: {
              id: managerAgentId,
              name: managerName,
              char: "@",
              metadata: { agentId: managerAgentId, title: managerName },
            },
          },
          { type: "text", text: xmlPayload },
        ],
      },
    ],
  };
}
