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
