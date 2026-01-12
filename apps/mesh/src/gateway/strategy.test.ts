import { describe, expect, test } from "bun:test";
import { parseStrategyFromMode } from "./strategy";

describe("parseStrategyFromMode", () => {
  test("returns passthrough when mode is undefined", () => {
    expect(parseStrategyFromMode(undefined)).toBe("passthrough");
  });

  test("returns passthrough when mode is empty string", () => {
    expect(parseStrategyFromMode("")).toBe("passthrough");
  });

  test("returns passthrough for invalid mode", () => {
    expect(parseStrategyFromMode("invalid")).toBe("passthrough");
    expect(parseStrategyFromMode("unknown")).toBe("passthrough");
  });

  test("returns passthrough for valid passthrough mode", () => {
    expect(parseStrategyFromMode("passthrough")).toBe("passthrough");
  });

  test("returns smart_tool_selection for valid mode", () => {
    expect(parseStrategyFromMode("smart_tool_selection")).toBe(
      "smart_tool_selection",
    );
  });

  test("returns code_execution for valid mode", () => {
    expect(parseStrategyFromMode("code_execution")).toBe("code_execution");
  });
});
