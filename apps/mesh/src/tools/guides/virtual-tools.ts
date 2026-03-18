import type { GuidePrompt, GuideResource } from "./index";

export const prompts: GuidePrompt[] = [];

export const resources: GuideResource[] = [
  {
    name: "virtual-tools",
    uri: "docs://virtual-tools.md",
    description:
      "Virtual tool code format, sandbox model, and schema conventions.",
    text: `# Virtual tools

## When to use them

Use virtual tools when:
- You need to chain multiple tool calls behind one reusable interface.
- You need lightweight transformation or orchestration logic.
- The agent should expose a simpler abstraction than the raw connection tools.

Do not use them when a single existing tool already solves the task.

## Sandbox contract

Virtual tools run as JavaScript in a sandbox with access to the downstream connection tools (not the full agent toolset).

\`\`\`javascript
export default async function (tools, args) {
  const result = await tools.some_tool({ id: args.id });
  return { result };
}
\`\`\`

### Arguments
- \`tools\`: an object of async functions representing available tools.
- \`args\`: validated input matching the declared input schema.

## Connection dependencies

When the code calls tools from specific connections, list those connection IDs in \`connection_dependencies\`. This metadata:
- Lets the platform sync and protect the downstream connections.
- Ensures the virtual tool breaks visibly if a dependency is removed.
- Is required for COLLECTION_VIRTUAL_TOOLS_CREATE and can be updated via COLLECTION_VIRTUAL_TOOLS_UPDATE.

## Input schema guidance

- Keep schemas narrow and explicit.
- Name fields after the task domain, not internal implementation details.
- Prefer simple shapes unless nested structure is necessary.
- The code must assume only schema-validated inputs are present.

## Output guidance

- Return structured JSON-friendly objects.
- Keep the output stable and useful for downstream prompts or automations.
- Avoid returning massive raw payloads when a summary is enough.

## Design patterns

### Good
- "summarize-latest-tickets"
- "prepare-order-brief"
- "sync-contact-and-log-note"

These are task-shaped and understandable.

### Bad
- "helper"
- "run-stuff"
- "tool2"

These do not communicate intent or scope.

## Safety

- Virtual tools can trigger consequential actions through underlying tools.
- Keep logic constrained and predictable.
- If the code performs destructive operations, the parent agent instructions should require confirmation.
`,
  },
];
