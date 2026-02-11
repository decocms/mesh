# User Ask Built-in Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a client-side `user_ask` tool that allows AI agents to gather user input during task execution with three interaction modes: text, choice, and confirm.

**Architecture:** The tool is defined using AI SDK's `tool()` function (not MCP/defineTool) and lives in `apps/mesh/src/api/routes/decopilot/built-in-tools/`. It's a client-side tool (no execute function), so when the LLM calls it, the tool call streams to the client where a React component renders an interactive prompt. The user responds via UI, and `addToolOutput` sends the response back to continue the conversation.

**Tech Stack:**
- Server: AI SDK tool(), Zod schemas
- Client: React 19, AI SDK useChat hook, typed tool parts
- Styling: Tailwind v4 design tokens

---

## Task 1: Create Built-in Tool Definition

**Files:**
- Create: `apps/mesh/src/api/routes/decopilot/built-in-tools/user-ask.ts`
- Create: `apps/mesh/src/api/routes/decopilot/built-in-tools/index.ts`

### Step 1: Write test for tool schema validation

Create test file: `apps/mesh/src/api/routes/decopilot/built-in-tools/user-ask.test.ts`

```typescript
import { describe, expect, test } from "bun:test";
import { userAskTool } from "./user-ask";

describe("userAskTool", () => {
  test("has correct metadata", () => {
    expect(userAskTool.description).toContain("Ask the user a question");
    expect(userAskTool.inputSchema).toBeDefined();
    expect(userAskTool.outputSchema).toBeDefined();
  });

  test("validates text input type", () => {
    const input = {
      prompt: "What is your name?",
      type: "text",
    };

    const result = userAskTool.inputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("validates choice input type with options", () => {
    const input = {
      prompt: "Select your preference",
      type: "choice",
      options: ["Option A", "Option B"],
    };

    const result = userAskTool.inputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("validates confirm input type", () => {
    const input = {
      prompt: "Do you want to continue?",
      type: "confirm",
      default: "yes",
    };

    const result = userAskTool.inputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("rejects choice without options", () => {
    const input = {
      prompt: "Select something",
      type: "choice",
    };

    const result = userAskTool.inputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("rejects empty prompt", () => {
    const input = {
      prompt: "",
      type: "text",
    };

    const result = userAskTool.inputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
```

### Step 2: Run test to verify it fails

Run: `bun test apps/mesh/src/api/routes/decopilot/built-in-tools/user-ask.test.ts`
Expected: FAIL with "Cannot find module './user-ask'"

### Step 3: Create tool definition with AI SDK

Create `apps/mesh/src/api/routes/decopilot/built-in-tools/user-ask.ts`:

```typescript
/**
 * user_ask Built-in Tool
 *
 * Client-side tool for gathering user input during task execution.
 * Uses AI SDK tool() function (not MCP defineTool).
 */

import { jsonSchema, tool } from "ai";
import { z } from "zod";

/**
 * Input schema for user_ask
 */
const UserAskInputSchema = z
  .object({
    prompt: z.string().min(1).describe("Question to ask the user"),
    type: z
      .enum(["text", "choice", "confirm"])
      .describe("Type of input to request"),
    options: z
      .array(z.string())
      .optional()
      .describe("Available choices (required for 'choice' type)"),
    default: z.string().optional().describe("Default value"),
  })
  .refine(
    (data) => {
      // If type is 'choice', options must be provided with at least 2 items
      if (data.type === "choice") {
        return data.options && data.options.length >= 2;
      }
      return true;
    },
    {
      message: "Options array with at least 2 items required for 'choice' type",
      path: ["options"],
    },
  );

export type UserAskInput = z.infer<typeof UserAskInputSchema>;

/**
 * Output schema for user_ask
 */
const UserAskOutputSchema = z.object({
  response: z.string().describe("User's response"),
});

export type UserAskOutput = z.infer<typeof UserAskOutputSchema>;

/**
 * user_ask tool definition (AI SDK)
 *
 * This is a CLIENT-SIDE tool - it has NO execute function.
 * The tool call is sent to the client, where the UI renders
 * an interactive prompt and the user provides a response.
 */
export const userAskTool = tool({
  description:
    "Ask the user a question and wait for their response. Use this when you need user input, confirmation, or a choice during task execution. Supports three types: 'text' (free-form input), 'choice' (select from options), and 'confirm' (yes/no).",
  inputSchema: jsonSchema(UserAskInputSchema),
  outputSchema: jsonSchema(UserAskOutputSchema),
  // NO execute function - client-side only
});
```

### Step 4: Create barrel export for built-in tools

Create `apps/mesh/src/api/routes/decopilot/built-in-tools/index.ts`:

```typescript
/**
 * Decopilot Built-in Tools
 *
 * Client-side tools for decopilot agent interactions.
 * These use AI SDK tool() function and are registered directly in the decopilot API.
 */

export { userAskTool } from "./user-ask";
export type { UserAskInput, UserAskOutput } from "./user-ask";
```

### Step 5: Run tests to verify they pass

Run: `bun test apps/mesh/src/api/routes/decopilot/built-in-tools/user-ask.test.ts -v`
Expected: PASS (all tests pass)

### Step 6: Run type check

Run: `bun run check`
Expected: No TypeScript errors

### Step 7: Format code

Run: `bun run fmt`
Expected: All files formatted

### Step 8: Commit

```bash
git add apps/mesh/src/api/routes/decopilot/built-in-tools/
git commit -m "feat(decopilot): add user_ask built-in tool definition

- Create user_ask tool with text/choice/confirm types
- Use AI SDK tool() function (not MCP defineTool)
- Add validation for required options on choice type
- Implement as client-side tool (no execute function)
- Add comprehensive test coverage

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Register Built-in Tools in Decopilot API

**Files:**
- Modify: `apps/mesh/src/api/routes/decopilot/routes.ts` (add built-in tools to streamText)

### Step 1: Write test for tool registration

Create test: `apps/mesh/src/api/routes/decopilot/built-in-tools/registration.test.ts`

```typescript
import { describe, expect, test } from "bun:test";
import { getBuiltInTools } from "./index";

describe("Built-in tools registration", () => {
  test("returns user_ask tool", () => {
    const tools = getBuiltInTools();
    expect(tools.user_ask).toBeDefined();
    expect(tools.user_ask.description).toContain("Ask the user a question");
  });

  test("tool has no execute function", () => {
    const tools = getBuiltInTools();
    expect(tools.user_ask.execute).toBeUndefined();
  });
});
```

### Step 2: Run test to verify it fails

Run: `bun test apps/mesh/src/api/routes/decopilot/built-in-tools/registration.test.ts`
Expected: FAIL with "getBuiltInTools is not defined"

### Step 3: Add getBuiltInTools helper

Modify `apps/mesh/src/api/routes/decopilot/built-in-tools/index.ts`:

```typescript
/**
 * Decopilot Built-in Tools
 *
 * Client-side tools for decopilot agent interactions.
 * These use AI SDK tool() function and are registered directly in the decopilot API.
 */

import type { ToolSet } from "ai";

export { userAskTool } from "./user-ask";
export type { UserAskInput, UserAskOutput } from "./user-ask";

/**
 * Get all built-in tools for decopilot
 * Returns a ToolSet that can be spread into streamText tools
 */
export function getBuiltInTools(): ToolSet {
  return {
    user_ask: userAskTool,
  };
}
```

### Step 4: Integrate into decopilot stream endpoint

Modify `apps/mesh/src/api/routes/decopilot/routes.ts`:

Add import at top:
```typescript
import { getBuiltInTools } from "./built-in-tools";
```

In the stream endpoint handler (around line 192), modify the `streamText` call to include built-in tools:

```typescript
// Around line 154 - after getting mcpTools
const [mcpTools, modelProvider] = await Promise.all([
  toolsFromMCP(mcpClient),
  createModelProviderFromClient(streamableModelClient, {
    modelId: model.id,
    connectionId: model.connectionId,
    fastId: model.fastId ?? null,
  }),
]);

// Add built-in tools
const builtInTools = getBuiltInTools();

// ... later in streamText call (around line 192)
const result = streamText({
  model: modelProvider.model,
  system: systemMessages,
  messages: prunedMessages,
  tools: {
    ...mcpTools,
    ...builtInTools, // Add built-in tools
  },
  temperature,
  maxOutputTokens,
  abortSignal,
  stopWhen: stepCountIs(30),
  // ... rest of config
});
```

### Step 5: Run tests

Run: `bun test apps/mesh/src/api/routes/decopilot/built-in-tools/registration.test.ts`
Expected: PASS

### Step 6: Run type check

Run: `bun run check`
Expected: No TypeScript errors

### Step 7: Format code

Run: `bun run fmt`
Expected: All files formatted

### Step 8: Commit

```bash
git add apps/mesh/src/api/routes/decopilot/
git commit -m "feat(decopilot): register built-in tools in stream endpoint

- Add getBuiltInTools() helper function
- Integrate built-in tools into streamText call
- Merge with MCP tools for unified tool access
- Add registration test coverage

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Create Client-Side UI Component

**Files:**
- Create: `apps/mesh/src/web/components/chat/message/parts/user-ask-prompt.tsx`
- Modify: `apps/mesh/src/web/components/chat/message/assistant.tsx` (add tool part case)

### Step 1: Write test for UI component rendering

Create test: `apps/mesh/src/web/components/chat/message/parts/user-ask-prompt.test.tsx`

```typescript
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { UserAskPrompt } from "./user-ask-prompt";

describe("UserAskPrompt", () => {
  test("renders text input prompt", () => {
    const part = {
      type: "tool-user_ask" as const,
      toolCallId: "call_1",
      toolName: "user_ask",
      state: "input-available" as const,
      input: {
        prompt: "What is your name?",
        type: "text",
      },
    };

    render(<UserAskPrompt part={part} onSubmit={() => {}} />);
    expect(screen.getByText("What is your name?")).toBeDefined();
  });

  test("renders choice input prompt with options", () => {
    const part = {
      type: "tool-user_ask" as const,
      toolCallId: "call_2",
      toolName: "user_ask",
      state: "input-available" as const,
      input: {
        prompt: "Select your preference",
        type: "choice",
        options: ["Option A", "Option B"],
      },
    };

    render(<UserAskPrompt part={part} onSubmit={() => {}} />);
    expect(screen.getByText("Option A")).toBeDefined();
    expect(screen.getByText("Option B")).toBeDefined();
  });

  test("renders confirm prompt with yes/no buttons", () => {
    const part = {
      type: "tool-user_ask" as const,
      toolCallId: "call_3",
      toolName: "user_ask",
      state: "input-available" as const,
      input: {
        prompt: "Continue with action?",
        type: "confirm",
      },
    };

    render(<UserAskPrompt part={part} onSubmit={() => {}} />);
    expect(screen.getByText("Yes")).toBeDefined();
    expect(screen.getByText("No")).toBeDefined();
  });
});
```

### Step 2: Run test to verify it fails

Run: `bun test apps/mesh/src/web/components/chat/message/parts/user-ask-prompt.test.tsx`
Expected: FAIL with "Cannot find module './user-ask-prompt'"

### Step 3: Create UI component

Create `apps/mesh/src/web/components/chat/message/parts/user-ask-prompt.tsx`:

```typescript
import { Input } from "@deco/ui/components/input";
import { Button } from "@deco/ui/components/button";
import { useState } from "react";
import { MessageQuestion } from "@untitledui/icons";

interface UserAskPart {
  type: "tool-user_ask";
  toolCallId: string;
  toolName: string;
  state: "input-streaming" | "input-available" | "output-available";
  input?: {
    prompt: string;
    type: "text" | "choice" | "confirm";
    options?: string[];
    default?: string;
  };
  output?: {
    response: string;
  };
}

interface UserAskPromptProps {
  part: UserAskPart;
  onSubmit: (response: string) => void;
}

export function UserAskPrompt({ part, onSubmit }: UserAskPromptProps) {
  const { state, input, output } = part;
  const [textValue, setTextValue] = useState(input?.default ?? "");

  // Still streaming input - show loading
  if (state === "input-streaming") {
    return (
      <div className="flex items-center gap-2 p-4 border rounded-lg bg-accent/50">
        <MessageQuestion className="size-5 text-muted-foreground shimmer" />
        <span className="text-sm text-muted-foreground shimmer">
          Preparing question...
        </span>
      </div>
    );
  }

  // Output available - show completed response
  if (state === "output-available" && output) {
    return (
      <div className="flex flex-col gap-2 p-4 border rounded-lg bg-accent/10">
        <div className="flex items-center gap-2">
          <MessageQuestion className="size-5 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            {input?.prompt}
          </span>
        </div>
        <div className="pl-7 text-sm text-muted-foreground">
          Response: <span className="font-medium">{output.response}</span>
        </div>
      </div>
    );
  }

  // Input available - show interactive prompt
  if (!input) return null;

  const handleTextSubmit = () => {
    if (textValue.trim()) {
      onSubmit(textValue);
    }
  };

  const handleChoiceSubmit = (choice: string) => {
    onSubmit(choice);
  };

  const handleConfirmSubmit = (confirmed: boolean) => {
    onSubmit(confirmed ? "yes" : "no");
  };

  return (
    <div className="flex flex-col gap-3 p-4 border rounded-lg bg-background">
      <div className="flex items-center gap-2">
        <MessageQuestion className="size-5 text-primary" />
        <span className="text-sm font-medium text-foreground">
          {input.prompt}
        </span>
      </div>

      <div className="pl-7">
        {input.type === "text" && (
          <div className="flex gap-2">
            <Input
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleTextSubmit();
                }
              }}
              placeholder="Type your response..."
              className="flex-1"
              autoFocus
            />
            <Button onClick={handleTextSubmit} size="sm">
              Submit
            </Button>
          </div>
        )}

        {input.type === "choice" && input.options && (
          <div className="flex flex-col gap-2">
            {input.options.map((option) => (
              <Button
                key={option}
                onClick={() => handleChoiceSubmit(option)}
                variant="outline"
                className="justify-start"
              >
                {option}
              </Button>
            ))}
          </div>
        )}

        {input.type === "confirm" && (
          <div className="flex gap-2">
            <Button
              onClick={() => handleConfirmSubmit(true)}
              variant="default"
              size="sm"
            >
              Yes
            </Button>
            <Button
              onClick={() => handleConfirmSubmit(false)}
              variant="outline"
              size="sm"
            >
              No
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
```

### Step 4: Run tests to verify they pass

Run: `bun test apps/mesh/src/web/components/chat/message/parts/user-ask-prompt.test.tsx -v`
Expected: PASS (all rendering tests pass)

### Step 5: Format code

Run: `bun run fmt`
Expected: All files formatted

### Step 6: Commit

```bash
git add apps/mesh/src/web/components/chat/message/parts/user-ask-prompt.tsx apps/mesh/src/web/components/chat/message/parts/user-ask-prompt.test.tsx
git commit -m "feat(ui): add UserAskPrompt component for user_ask tool

- Support text, choice, and confirm input types
- Interactive UI with proper loading and completed states
- Keyboard support for text input (Enter to submit)
- Add comprehensive rendering tests

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Integrate with Chat Message Renderer

**Files:**
- Modify: `apps/mesh/src/web/components/chat/message/assistant.tsx`

### Step 1: Write integration test

Create test: `apps/mesh/src/web/components/chat/message/assistant-user-ask.test.tsx`

```typescript
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { AssistantMessage } from "./assistant";

describe("AssistantMessage with user_ask tool", () => {
  test("renders user_ask tool part", () => {
    const message = {
      id: "msg_1",
      role: "assistant" as const,
      parts: [
        {
          type: "tool-user_ask" as const,
          toolCallId: "call_1",
          toolName: "user_ask",
          state: "input-available" as const,
          input: {
            prompt: "What is your name?",
            type: "text" as const,
          },
        },
      ],
    };

    render(<AssistantMessage message={message} addToolOutput={() => {}} />);

    expect(screen.getByText("What is your name?")).toBeDefined();
  });
});
```

### Step 2: Run test to verify it fails

Run: `bun test apps/mesh/src/web/components/chat/message/assistant-user-ask.test.tsx`
Expected: FAIL (user_ask part not rendered)

### Step 3: Read current assistant message structure

Run: `cat apps/mesh/src/web/components/chat/message/assistant.tsx | head -50`
Expected: See current structure to understand where to add user_ask case

### Step 4: Add user_ask case to assistant message renderer

Modify `apps/mesh/src/web/components/chat/message/assistant.tsx`:

Add import at top:

```typescript
import { UserAskPrompt } from "./parts/user-ask-prompt";
```

Find the part rendering logic (look for where other tool parts like `dynamic-tool` are handled) and add:

```typescript
// Add this case in the part rendering switch/if statements
if (part.type === "tool-user_ask") {
  return (
    <UserAskPrompt
      key={part.toolCallId}
      part={part}
      onSubmit={(response) => {
        addToolOutput({
          tool: "user_ask",
          toolCallId: part.toolCallId,
          output: { response },
        });
      }}
    />
  );
}
```

### Step 5: Run integration test

Run: `bun test apps/mesh/src/web/components/chat/message/assistant-user-ask.test.tsx`
Expected: PASS (user_ask part renders correctly)

### Step 6: Run all chat component tests

Run: `bun test apps/mesh/src/web/components/chat/`
Expected: All tests pass

### Step 7: Format code

Run: `bun run fmt`
Expected: All files formatted

### Step 8: Commit

```bash
git add apps/mesh/src/web/components/chat/message/assistant.tsx apps/mesh/src/web/components/chat/message/assistant-user-ask.test.tsx
git commit -m "feat(chat): integrate user_ask tool with message renderer

- Add user_ask case to assistant message part handler
- Wire up addToolOutput callback for response submission
- Add integration test for tool rendering
- Ensure proper tool output format

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Add TypeScript Type Declarations

**Files:**
- Modify: `apps/mesh/src/web/components/chat/types.ts` (add user_ask types)

### Step 1: Read existing types file

Run: `cat apps/mesh/src/web/components/chat/types.ts | head -100`
Expected: See existing type structure

### Step 2: Add user_ask tool part type

Modify `apps/mesh/src/web/components/chat/types.ts`:

Add the following type definition (location depends on existing structure):

```typescript
/**
 * user_ask tool part type for typed tool rendering
 */
export interface UserAskToolPart {
  type: "tool-user_ask";
  toolCallId: string;
  toolName: "user_ask";
  state: "input-streaming" | "input-available" | "output-available";
  input?: {
    prompt: string;
    type: "text" | "choice" | "confirm";
    options?: string[];
    default?: string;
  };
  output?: {
    response: string;
  };
}

// If there's a union type for tool parts, add UserAskToolPart to it
// Example: export type ToolPart = DynamicToolPart | UserAskToolPart | ...
```

### Step 3: Run type check

Run: `bun run check`
Expected: No TypeScript errors

### Step 4: Format code

Run: `bun run fmt`
Expected: All files formatted

### Step 5: Commit

```bash
git add apps/mesh/src/web/components/chat/types.ts
git commit -m "feat(types): add user_ask tool part type declarations

- Define UserAskToolPart interface
- Ensure type safety for tool part handling
- Support all three input modes with proper types

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: End-to-End Testing

**Files:**
- Create: `apps/mesh/src/api/routes/decopilot/built-in-tools/user-ask.e2e.test.ts`

### Step 1: Write E2E test

Create `apps/mesh/src/api/routes/decopilot/built-in-tools/user-ask.e2e.test.ts`:

```typescript
/**
 * End-to-end test for user_ask tool
 *
 * This test verifies the full flow:
 * 1. Tool is defined with correct schemas
 * 2. Tool is registered in built-in tools
 * 3. Tool has no execute function (client-side)
 */

import { describe, expect, test } from "bun:test";
import { userAskTool } from "./user-ask";
import { getBuiltInTools } from "./index";

describe("user_ask E2E", () => {
  test("tool is registered in built-in tools", () => {
    const tools = getBuiltInTools();
    expect(tools.user_ask).toBeDefined();
    expect(tools.user_ask).toBe(userAskTool);
  });

  test("tool has correct metadata", () => {
    expect(userAskTool.description).toContain("Ask the user a question");
    expect(userAskTool.inputSchema).toBeDefined();
    expect(userAskTool.outputSchema).toBeDefined();
  });

  test("tool has no execute function", () => {
    expect(userAskTool.execute).toBeUndefined();
  });

  test("input schema accepts valid text input", () => {
    const result = userAskTool.inputSchema.safeParse({
      prompt: "What is your name?",
      type: "text",
    });

    expect(result.success).toBe(true);
  });

  test("input schema accepts valid choice input", () => {
    const result = userAskTool.inputSchema.safeParse({
      prompt: "Select option",
      type: "choice",
      options: ["A", "B", "C"],
    });

    expect(result.success).toBe(true);
  });

  test("input schema accepts valid confirm input", () => {
    const result = userAskTool.inputSchema.safeParse({
      prompt: "Confirm action?",
      type: "confirm",
      default: "yes",
    });

    expect(result.success).toBe(true);
  });

  test("input schema rejects choice without options", () => {
    const result = userAskTool.inputSchema.safeParse({
      prompt: "Select",
      type: "choice",
    });

    expect(result.success).toBe(false);
  });

  test("input schema rejects choice with single option", () => {
    const result = userAskTool.inputSchema.safeParse({
      prompt: "Select",
      type: "choice",
      options: ["Only one"],
    });

    expect(result.success).toBe(false);
  });
});
```

### Step 2: Run E2E tests

Run: `bun test apps/mesh/src/api/routes/decopilot/built-in-tools/user-ask.e2e.test.ts -v`
Expected: PASS (all E2E tests pass)

### Step 3: Run full test suite

Run: `bun test`
Expected: All tests pass

### Step 4: Format code

Run: `bun run fmt`
Expected: All files formatted

### Step 5: Commit

```bash
git add apps/mesh/src/api/routes/decopilot/built-in-tools/user-ask.e2e.test.ts
git commit -m "test(decopilot): add E2E tests for user_ask tool

- Verify tool registration in built-in tools
- Test schema validation for all input types
- Confirm no execute function (client-side only)
- Ensure complete integration coverage

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Documentation

**Files:**
- Create: `apps/docs/src/content/docs/api-reference/built-in-tools/user-ask.mdx`

### Step 1: Create documentation file

Create `apps/docs/src/content/docs/api-reference/built-in-tools/user-ask.mdx`:

```mdx
---
title: user_ask
description: Ask the user a question and wait for their response during task execution
---

# user_ask

Ask the user a question and wait for their response. Use this when you need user input, confirmation, or a choice during task execution.

## Input Types

### Text Input

Ask the user for free-form text input.

```typescript
{
  prompt: "What is your name?",
  type: "text",
  default?: "John" // Optional default value
}
```

### Choice Input

Present the user with multiple options to choose from.

```typescript
{
  prompt: "Which environment should we deploy to?",
  type: "choice",
  options: ["development", "staging", "production"]
}
```

**Requirements:**
- `options` array must contain at least 2 items
- User can select exactly one option

### Confirm Input

Ask the user for yes/no confirmation.

```typescript
{
  prompt: "Do you want to continue with this action?",
  type: "confirm",
  default?: "yes" // Optional: "yes" or "no"
}
```

**Response:**
- Returns `"yes"` or `"no"` as a string

## Output

```typescript
{
  response: string // The user's response
}
```

## Examples

### Example 1: Text Input

```typescript
// Agent calls user_ask
{
  prompt: "What should we name this new feature?",
  type: "text"
}

// User responds
{
  response: "Dark mode toggle"
}
```

### Example 2: Choice Input

```typescript
// Agent calls user_ask
{
  prompt: "Which API version should we target?",
  type: "choice",
  options: ["v1", "v2", "v3"]
}

// User responds
{
  response: "v2"
}
```

### Example 3: Confirm Input

```typescript
// Agent calls user_ask
{
  prompt: "This will delete 50 records. Are you sure?",
  type: "confirm"
}

// User responds
{
  response: "yes"
}
```

## Behavior

- **Blocks execution** until the user provides a response
- **Streams to client** - tool call appears in chat UI immediately
- **Interactive UI** - renders appropriate input widget based on type
- **Client-side only** - no server execution

## UI Rendering

The tool renders different UI based on the input type:

- **Text**: Input field with submit button (Enter to submit)
- **Choice**: Vertical stack of clickable option buttons
- **Confirm**: Yes/No buttons

## Error Handling

The tool validates:
- ✅ Prompt is non-empty
- ✅ Type is one of: text, choice, confirm
- ✅ Choice type has at least 2 options

## Best Practices

1. **Clear prompts**: Make questions specific and actionable
2. **Reasonable options**: For choice type, limit to 2-6 options
3. **Confirm for destructive actions**: Always use confirm for delete/modify operations
4. **Defaults for common cases**: Provide sensible defaults when appropriate

## Technical Details

- **Type**: Client-side tool (no server execution)
- **Framework**: AI SDK tool() function
- **Protocol**: Streams via AI SDK useChat hook
- **Response**: Uses `addToolOutput` for submission
- **Validation**: Zod schema with refinement for choice options
- **Location**: `apps/mesh/src/api/routes/decopilot/built-in-tools/user-ask.ts`
```

### Step 2: Build docs to verify syntax

Run: `bun run --cwd=apps/docs build`
Expected: Docs build successfully without errors

### Step 3: Commit

```bash
git add apps/docs/src/content/docs/api-reference/built-in-tools/user-ask.mdx
git commit -m "docs(decopilot): add user_ask tool documentation

- Document all three input types with examples
- Provide best practices and error handling guide
- Add technical implementation details
- Include UI behavior and validation rules

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Final Validation & Testing

**Files:**
- All previously created/modified files

### Step 1: Run full test suite

Run: `bun test`
Expected: All tests pass (including new user_ask tests)

### Step 2: Run type checking

Run: `bun run check`
Expected: No TypeScript errors across all workspaces

### Step 3: Run linting

Run: `bun run lint`
Expected: No linting errors

### Step 4: Format all code

Run: `bun run fmt`
Expected: All files formatted consistently

### Step 5: Build mesh client

Run: `bun run --cwd=apps/mesh build:client`
Expected: Client builds successfully

### Step 6: Build mesh server

Run: `bun run --cwd=apps/mesh build:server`
Expected: Server builds successfully

### Step 7: Manual smoke test (if possible)

1. Start dev environment: `bun run dev`
2. Open decopilot chat UI
3. Select an agent and model
4. Send a message that would benefit from user input
5. Agent should call user_ask tool
6. Verify interactive prompt appears in chat
7. Submit response (try each type: text, choice, confirm)
8. Verify response is sent back to LLM and conversation continues

Expected: Full flow works end-to-end

### Step 8: Update bead task status

Run: `bd update main-2j3.1 --status completed`
Expected: Task marked as completed in beads

### Step 9: Create final commit if needed

If any fixes were made during validation:

```bash
git add .
git commit -m "chore(decopilot): final validation and cleanup for user_ask

- Ensure all tests pass
- Fix any type errors
- Apply consistent formatting
- Verify build succeeds

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Summary

This plan implements the user_ask built-in tool with:

✅ AI SDK tool() definition (not MCP defineTool)
✅ Located in `apps/mesh/src/api/routes/decopilot/built-in-tools/`
✅ Client-side UI component for three input types
✅ Integration with chat message renderer
✅ Registration in decopilot stream endpoint
✅ TypeScript type safety
✅ Comprehensive test coverage
✅ Complete documentation

**Architecture Differences from Original Plan:**
- Uses AI SDK `tool()` instead of MCP `defineTool()`
- Lives in decopilot routes, not general tools folder
- Registered directly in streamText, not via MCP server
- Simpler integration (no MCP protocol overhead)

**Next Steps:**
- Consider adding timeout for user responses
- Add support for multi-select choice type
- Implement visual customization options (colors, icons)
- Add analytics tracking for user_ask usage
- Add task vs subtask context checking (when ready)

**Related Tasks:**
- `main-o14.1` - Task vs subtask distinction (future enhancement)
- `main-7hq.1` - Tool registry (for scope-based discovery)
- `main-4tk` - Context system (for storing responses as context)
