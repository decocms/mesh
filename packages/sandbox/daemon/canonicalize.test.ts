import { describe, expect, it } from "bun:test";
import { canonicalize } from "./canonicalize";

describe("canonicalize", () => {
  it("sorts keys recursively at every depth", () => {
    const a = { b: 1, a: 2, c: { z: 1, a: 2 } };
    const b = { a: 2, c: { a: 2, z: 1 }, b: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it("treats undefined and missing keys identically", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe(canonicalize({ a: 1 }));
  });

  it("emits no whitespace", () => {
    const out = canonicalize({ a: 1, b: { c: 2 } });
    expect(out).toBe('{"a":1,"b":{"c":2}}');
  });

  it("preserves array order (arrays are positional, not unordered)", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });

  it("converts undefined inside arrays to null (JSON-safe)", () => {
    expect(canonicalize([1, undefined, 2])).toBe("[1,null,2]");
  });

  it("handles nested env-style maps deterministically", () => {
    const env1 = { FOO: "1", BAR: "2", BAZ: "3" };
    const env2 = { BAZ: "3", FOO: "1", BAR: "2" };
    const p1 = { schemaVersion: 1, env: env1 };
    const p2 = { schemaVersion: 1, env: env2 };
    expect(canonicalize(p1)).toBe(canonicalize(p2));
  });

  it("is byte-identical for shuffled bootstrap payloads", () => {
    const a = {
      schemaVersion: 1,
      runtime: "node",
      daemonToken: "t".repeat(32),
      env: { B: "2", A: "1" },
    };
    const b = {
      env: { A: "1", B: "2" },
      runtime: "node",
      daemonToken: "t".repeat(32),
      schemaVersion: 1,
    };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it("primitive passthrough", () => {
    expect(canonicalize("x")).toBe('"x"');
    expect(canonicalize(42)).toBe("42");
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize(true)).toBe("true");
  });
});
