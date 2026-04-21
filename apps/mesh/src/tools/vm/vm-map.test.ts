/**
 * Unit tests for vmMap helpers (pure functions).
 */

import { describe, expect, test } from "bun:test";

import { readVmMap, resolveVm } from "./vm-map";

describe("readVmMap", () => {
  test("returns empty object when metadata is null", () => {
    expect(readVmMap(null)).toEqual({});
  });

  test("returns empty object when metadata is undefined", () => {
    expect(readVmMap(undefined)).toEqual({});
  });

  test("returns empty object when vmMap key is missing", () => {
    expect(readVmMap({ githubRepo: null })).toEqual({});
  });

  test("returns the vmMap when present", () => {
    const vmMap = { "user-1": { main: "vm-1" } };
    expect(readVmMap({ vmMap })).toEqual(vmMap);
  });

  test("returns empty when vmMap is not an object", () => {
    expect(readVmMap({ vmMap: "not an object" })).toEqual({});
  });
});

describe("resolveVm", () => {
  test("returns null when user is absent", () => {
    expect(resolveVm({}, "user-1", "main")).toBeNull();
  });

  test("returns null when branch is absent for that user", () => {
    const vmMap = { "user-1": { main: "vm-1" } };
    expect(resolveVm(vmMap, "user-1", "feat/x")).toBeNull();
  });

  test("returns the vm id when both are present", () => {
    const vmMap = { "user-1": { main: "vm-1", "feat/x": "vm-2" } };
    expect(resolveVm(vmMap, "user-1", "feat/x")).toBe("vm-2");
  });

  test("isolates users from each other", () => {
    const vmMap = {
      "user-1": { main: "vm-1" },
      "user-2": { main: "vm-2" },
    };
    expect(resolveVm(vmMap, "user-1", "main")).toBe("vm-1");
    expect(resolveVm(vmMap, "user-2", "main")).toBe("vm-2");
  });
});
