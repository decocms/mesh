import { describe, expect, test } from "bun:test";
import { resolveThreadStatus } from "./status";

describe("resolveThreadStatus", () => {
  test("stop -> completed", () => {
    expect(resolveThreadStatus("stop", [])).toBe("completed");
  });

  test("stop with last text part containing ? -> requires_action", () => {
    const parts = [
      { type: "text", text: "Here is the answer." },
      { type: "text", text: "Does that help?" },
    ];
    expect(resolveThreadStatus("stop", parts)).toBe("requires_action");
  });

  test("stop with last text part not containing ? -> completed", () => {
    const parts = [{ type: "text", text: "Here is the answer." }];
    expect(resolveThreadStatus("stop", parts)).toBe("completed");
  });

  test("stop with last text part (after non-text) containing ? -> requires_action", () => {
    const parts = [
      { type: "text", text: "Done." },
      { type: "tool-invocation", toolName: "x", state: "result" },
      { type: "text", text: "Want more?" },
    ];
    expect(resolveThreadStatus("stop", parts)).toBe("requires_action");
  });

  test("stop with URL containing query string in last text part -> completed", () => {
    const parts = [
      {
        type: "text",
        text: "Check this link: https://example.com/api?foo=bar&baz=qux",
      },
    ];
    expect(resolveThreadStatus("stop", parts)).toBe("completed");
  });

  test("stop with inline code containing ? (ternary) in last text part -> completed", () => {
    const parts = [
      {
        type: "text",
        text: "Use a ternary: `x ? y : z` for that.",
      },
    ];
    expect(resolveThreadStatus("stop", parts)).toBe("completed");
  });

  test("stop with fenced code block containing ? in last text part -> completed", () => {
    const parts = [
      {
        type: "text",
        text: "Here's the code:\n\n```js\nconst x = a ? b : c;\n```\n\nDone.",
      },
    ];
    expect(resolveThreadStatus("stop", parts)).toBe("completed");
  });

  test("stop with URL and real question in last text part -> requires_action", () => {
    const parts = [
      {
        type: "text",
        text: "See https://example.com?ref=1 for details. Does that help?",
      },
    ];
    expect(resolveThreadStatus("stop", parts)).toBe("requires_action");
  });

  test("stop with markdown image containing pre-signed S3 URL -> completed", () => {
    const parts = [
      {
        type: "text",
        text: "Perfect! I've generated an image of a capybara having ice cream for you! \n\n![Capybara enjoying ice cream](https://deco-chat-shared-deco-team.c95fc4cec7fc52453228d9db170c372c.r2.cloudflarestorage.com//images/2026-02-18T16-25-14-100Z.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=12fd512fec8b8158e9e414db6675a3d9%2F20260218%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20260218T162516Z&X-Amz-Expires=3600&X-Amz-Signature=d7372684ded0dd344372e83b7c1953192cb498a697ae7dd713b24cb4c6f16c20&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)\n\nHere's your adorable capybara enjoying some ice cream! 🍦",
      },
    ];
    expect(resolveThreadStatus("stop", parts)).toBe("completed");
  });

  test("tool-calls without user_ask -> completed", () => {
    const parts = [
      { type: "tool-invocation", toolName: "some_tool", state: "result" },
    ];
    expect(resolveThreadStatus("tool-calls", parts)).toBe("completed");
  });

  test("tool-calls with user_ask input-available -> requires_action", () => {
    const parts = [
      {
        type: "tool-user_ask",
        toolName: "user_ask",
        state: "input-available",
      },
    ];
    expect(resolveThreadStatus("tool-calls", parts)).toBe("requires_action");
  });

  test("tool-calls with user_ask output-available -> completed", () => {
    const parts = [
      {
        type: "tool-user_ask",
        toolName: "user_ask",
        state: "output-available",
      },
    ];
    expect(resolveThreadStatus("tool-calls", parts)).toBe("completed");
  });

  test("tool-calls with approval-requested -> requires_action", () => {
    const parts = [
      {
        type: "tool-invocation",
        toolName: "some_tool",
        state: "approval-requested",
      },
    ];
    expect(resolveThreadStatus("tool-calls", parts)).toBe("requires_action");
  });

  test("tool-calls with multiple tools, one approval-requested -> requires_action", () => {
    const parts = [
      {
        type: "tool-invocation",
        toolName: "tool_a",
        state: "output-available",
      },
      {
        type: "tool-invocation",
        toolName: "tool_b",
        state: "approval-requested",
      },
    ];
    expect(resolveThreadStatus("tool-calls", parts)).toBe("requires_action");
  });

  test("tool-calls with approval-requested and user_ask pending -> requires_action", () => {
    const parts = [
      {
        type: "tool-invocation",
        toolName: "some_tool",
        state: "approval-requested",
      },
      {
        type: "tool-user_ask",
        toolName: "user_ask",
        state: "input-available",
      },
    ];
    expect(resolveThreadStatus("tool-calls", parts)).toBe("requires_action");
  });

  test("tool-calls with denied approval -> completed", () => {
    const parts = [
      {
        type: "tool-invocation",
        toolName: "some_tool",
        state: "output-denied",
      },
    ];
    expect(resolveThreadStatus("tool-calls", parts)).toBe("completed");
  });

  test("length -> failed", () => {
    expect(resolveThreadStatus("length", [])).toBe("failed");
  });

  test("error -> failed", () => {
    expect(resolveThreadStatus("error", [])).toBe("failed");
  });

  test("undefined -> failed", () => {
    expect(resolveThreadStatus(undefined, [])).toBe("failed");
  });
});
