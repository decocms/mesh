import { describe, expect, test } from "bun:test";
import { resolveThreadStatus } from "./status";

describe("resolveThreadStatus", () => {
  test("stop -> completed", () => {
    expect(resolveThreadStatus("stop", [])).toBe("completed");
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
