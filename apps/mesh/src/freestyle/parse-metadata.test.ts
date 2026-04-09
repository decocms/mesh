import { describe, test, expect } from "bun:test";
import {
  parseFreestyleMetadata,
  emptyFreestyleMetadata,
} from "./parse-metadata";

describe("parseFreestyleMetadata", () => {
  test("parses valid metadata", () => {
    const result = parseFreestyleMetadata({
      repo_url: "owner/repo",
      runtime: "bun",
      runtime_status: "running",
      preview_port: 3000,
      autorun: "dev",
      scripts: { dev: "bun dev" },
      vm_domain: "abc.freestyle.sh",
    });

    expect(result.repo_url).toBe("owner/repo");
    expect(result.runtime).toBe("bun");
    expect(result.runtime_status).toBe("running");
    expect(result.preview_port).toBe(3000);
    expect(result.autorun).toBe("dev");
    expect(result.scripts).toEqual({ dev: "bun dev" });
    expect(result.vm_domain).toBe("abc.freestyle.sh");
  });

  test("returns empty object for null/undefined", () => {
    expect(parseFreestyleMetadata(null)).toEqual({});
    expect(parseFreestyleMetadata(undefined)).toEqual({});
  });

  test("returns null for invalid types", () => {
    const result = parseFreestyleMetadata({
      repo_url: 123,
      runtime: "python",
      runtime_status: "unknown",
      preview_port: "abc",
      autorun: 42,
    });

    expect(result.repo_url).toBeNull();
    expect(result.runtime).toBeNull();
    expect(result.runtime_status).toBeNull();
    expect(result.preview_port).toBeNull();
    expect(result.autorun).toBeNull();
  });

  test("rejects preview_port out of range", () => {
    expect(parseFreestyleMetadata({ preview_port: 0 }).preview_port).toBeNull();
    expect(
      parseFreestyleMetadata({ preview_port: -1 }).preview_port,
    ).toBeNull();
    expect(
      parseFreestyleMetadata({ preview_port: 65536 }).preview_port,
    ).toBeNull();
    expect(
      parseFreestyleMetadata({ preview_port: 3.14 }).preview_port,
    ).toBeNull();
  });

  test("accepts preview_port at boundaries", () => {
    expect(parseFreestyleMetadata({ preview_port: 1 }).preview_port).toBe(1);
    expect(parseFreestyleMetadata({ preview_port: 65535 }).preview_port).toBe(
      65535,
    );
  });
});

describe("emptyFreestyleMetadata", () => {
  test("returns all 11 fields as null", () => {
    const empty = emptyFreestyleMetadata();
    const keys = Object.keys(empty);

    expect(keys).toHaveLength(11);
    expect(keys).toContain("repo_url");
    expect(keys).toContain("freestyle_repo_id");
    expect(keys).toContain("freestyle_vm_id");
    expect(keys).toContain("freestyle_snapshot_id");
    expect(keys).toContain("runtime");
    expect(keys).toContain("runtime_status");
    expect(keys).toContain("running_script");
    expect(keys).toContain("vm_domain");
    expect(keys).toContain("scripts");
    expect(keys).toContain("preview_port");
    expect(keys).toContain("autorun");

    for (const value of Object.values(empty)) {
      expect(value).toBeNull();
    }
  });
});
