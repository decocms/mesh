import { describe, expect, it } from "bun:test";
import { scriptArgs } from "./script-args";

describe("scriptArgs", () => {
  it("returns BSD-style args on darwin", () => {
    const orig = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin" });
    try {
      expect(scriptArgs("git clone foo bar")).toEqual([
        "-q",
        "/dev/null",
        "sh",
        "-c",
        "git clone foo bar",
      ]);
    } finally {
      Object.defineProperty(process, "platform", { value: orig });
    }
  });

  it("returns GNU-style args on linux", () => {
    const orig = process.platform;
    Object.defineProperty(process, "platform", { value: "linux" });
    try {
      expect(scriptArgs("git clone foo bar")).toEqual([
        "-q",
        "-c",
        "git clone foo bar",
        "/dev/null",
      ]);
    } finally {
      Object.defineProperty(process, "platform", { value: orig });
    }
  });
});
