import { describe, expect, test } from "bun:test";
import { extractTextFromOutput, getToolPartErrorText } from "./utils.ts";

describe("extractTextFromOutput", () => {
  test("returns null for null/undefined", () => {
    expect(extractTextFromOutput(null)).toBeNull();
    expect(extractTextFromOutput(undefined)).toBeNull();
  });

  test("returns null for non-object", () => {
    expect(extractTextFromOutput("string")).toBeNull();
    expect(extractTextFromOutput(42)).toBeNull();
  });

  test("returns null when parts is missing", () => {
    expect(extractTextFromOutput({})).toBeNull();
  });

  test("returns null when parts is empty array", () => {
    expect(extractTextFromOutput({ parts: [] })).toBeNull();
  });

  test("returns null when parts is not array", () => {
    expect(extractTextFromOutput({ parts: "not-array" })).toBeNull();
  });

  test("returns null when no text parts", () => {
    expect(
      extractTextFromOutput({ parts: [{ type: "tool-call" }] }),
    ).toBeNull();
  });

  test("returns text for single text part", () => {
    const output = { parts: [{ type: "text", text: "Hello" }] };
    expect(extractTextFromOutput(output)).toBe("Hello");
  });

  test("joins multiple text parts with double newline", () => {
    const output = {
      parts: [
        { type: "text", text: "First" },
        { type: "tool-call" },
        { type: "text", text: "Second" },
      ],
    };
    expect(extractTextFromOutput(output)).toBe("First\n\nSecond");
  });

  test("skips parts with non-string text", () => {
    const output = {
      parts: [
        { type: "text", text: 42 },
        { type: "text", text: "Valid" },
      ],
    };
    expect(extractTextFromOutput(output)).toBe("Valid");
  });

  test("handles reasoning parts", () => {
    const output = {
      parts: [{ type: "reasoning", text: "Thinking about the problem..." }],
    };
    expect(extractTextFromOutput(output)).toBe(
      "## Reasoning\nThinking about the problem...",
    );
  });

  test("handles source-url parts", () => {
    const output = {
      parts: [{ type: "source-url", url: "https://example.com" }],
    };
    expect(extractTextFromOutput(output)).toBe(
      "## Source URL\nhttps://example.com",
    );
  });

  test("handles source-document parts", () => {
    const output = {
      parts: [{ type: "source-document", title: "API Documentation" }],
    };
    expect(extractTextFromOutput(output)).toBe(
      "## Source Document\nAPI Documentation",
    );
  });

  test("handles file parts with filename", () => {
    const output = {
      parts: [
        { type: "file", filename: "report.pdf", url: "https://example.com" },
      ],
    };
    expect(extractTextFromOutput(output)).toBe("## File\nreport.pdf");
  });

  test("handles file parts with only url", () => {
    const output = {
      parts: [{ type: "file", url: "https://example.com/file.pdf" }],
    };
    expect(extractTextFromOutput(output)).toBe(
      "## File\nhttps://example.com/file.pdf",
    );
  });

  test("ignores step-start parts", () => {
    const output = {
      parts: [
        { type: "text", text: "Before" },
        { type: "step-start" },
        { type: "text", text: "After" },
      ],
    };
    expect(extractTextFromOutput(output)).toBe("Before\n\nAfter");
  });

  test("handles tool-call with input-streaming state", () => {
    const output = {
      parts: [
        {
          type: "tool-call-read",
          state: "input-streaming",
        },
      ],
    };
    expect(extractTextFromOutput(output)).toBe(
      "## call-read\nInput streaming...",
    );
  });

  test("handles tool-call with input-available state", () => {
    const output = {
      parts: [
        {
          type: "tool-call-write",
          state: "input-available",
          input: { path: "/test/file.txt" },
        },
      ],
    };
    expect(extractTextFromOutput(output)).toContain("## call-write");
    expect(extractTextFromOutput(output)).toContain("### Input");
    expect(extractTextFromOutput(output)).toContain('{"path":"/test/file');
  });

  test("handles tool-call with approval-requested state", () => {
    const output = {
      parts: [
        {
          type: "tool-call-bash",
          state: "approval-requested",
          input: { command: "ls" },
        },
      ],
    };
    expect(extractTextFromOutput(output)).toBe(
      "## call-bash\nApproval requested...",
    );
  });

  test("handles tool-call with approval-responded state", () => {
    const output = {
      parts: [
        {
          type: "tool-call-bash",
          state: "approval-responded",
          input: { command: "ls" },
        },
      ],
    };
    expect(extractTextFromOutput(output)).toBe(
      "## call-bash\nApproval responded...",
    );
  });

  test("handles tool-call with output-available state and output", () => {
    const output = {
      parts: [
        {
          type: "tool-call-read",
          state: "output-available",
          input: { path: "/test.txt" },
          output: "File contents here",
        },
      ],
    };
    const result = extractTextFromOutput(output);
    expect(result).toContain("## call-read");
    expect(result).toContain('Input: {"path":"/test.txt"}...');
    expect(result).toContain('Output: "File contents here"...');
  });

  test("handles tool-call with output-available state but no output", () => {
    const output = {
      parts: [
        {
          type: "tool-call-read",
          state: "output-available",
          input: { path: "/test.txt" },
          output: null,
        },
      ],
    };
    const result = extractTextFromOutput(output);
    expect(result).toContain("## call-read");
    expect(result).toContain("Tool responded with no output");
  });

  test("handles tool-call with output-error state with errorText", () => {
    const output = {
      parts: [
        {
          type: "tool-call-bash",
          state: "output-error",
          input: { command: "invalid" },
          errorText: "Command not found",
        },
      ],
    };
    const result = extractTextFromOutput(output);
    expect(result).toContain("## call-bash");
    expect(result).toContain('Input: {"command":"invalid"}...');
    expect(result).toContain("Error: Command not found");
  });

  test("handles tool-call with output-error state without errorText", () => {
    const output = {
      parts: [
        {
          type: "tool-call-bash",
          state: "output-error",
          input: { command: "invalid" },
        },
      ],
    };
    const result = extractTextFromOutput(output);
    expect(result).toContain("## call-bash");
    expect(result).toContain("Tool responded with an error");
  });

  test("handles tool-call with output-denied state", () => {
    const output = {
      parts: [
        {
          type: "tool-call-bash",
          state: "output-denied",
          input: { command: "rm -rf /" },
        },
      ],
    };
    const result = extractTextFromOutput(output);
    expect(result).toContain("## call-bash");
    expect(result).toContain("Tool execution was denied");
  });

  test("handles dynamic-tool parts", () => {
    const output = {
      parts: [
        {
          type: "dynamic-tool",
          toolName: "custom_tool",
          state: "output-available",
          input: { param: "value" },
          output: { result: "success" },
        },
      ],
    };
    const result = extractTextFromOutput(output);
    expect(result).toContain("## custom_tool");
    expect(result).toContain("Input:");
    expect(result).toContain("Output:");
  });

  test("handles complex mixed parts", () => {
    const output = {
      parts: [
        { type: "text", text: "Starting task" },
        { type: "reasoning", text: "Need to read file first" },
        {
          type: "tool-call-read",
          state: "output-available",
          input: { path: "/test.txt" },
          output: "content",
        },
        { type: "text", text: "Task complete" },
      ],
    };
    const result = extractTextFromOutput(output);
    expect(result).toContain("Starting task");
    expect(result).toContain("## Reasoning\nNeed to read file first");
    expect(result).toContain("## call-read");
    expect(result).toContain("Task complete");
    // Ensure parts are joined with double newlines
    expect(result?.split("\n\n").length).toBeGreaterThan(1);
  });

  test("does not add trailing newline", () => {
    const output = {
      parts: [
        { type: "text", text: "First" },
        { type: "text", text: "Second" },
      ],
    };
    const result = extractTextFromOutput(output);
    expect(result).toBe("First\n\nSecond");
    expect(result?.endsWith("\n\n")).toBe(false);
  });
});

describe("getToolPartErrorText", () => {
  test("returns errorText when present and string", () => {
    expect(getToolPartErrorText({ errorText: "Oops" })).toBe("Oops");
  });

  test("returns fallback when errorText missing", () => {
    expect(getToolPartErrorText({})).toBe("An unknown error occurred");
  });

  test("returns custom fallback", () => {
    expect(getToolPartErrorText({}, "Subtask failed")).toBe("Subtask failed");
  });

  test("returns fallback when errorText is not a string", () => {
    expect(getToolPartErrorText({ errorText: 42 })).toBe(
      "An unknown error occurred",
    );
  });
});
