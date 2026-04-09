import type { FreestyleMetadata } from "./types";

/**
 * Parse raw entity metadata into a typed FreestyleMetadata object.
 * Replaces unsafe `as` casts scattered across UI components.
 */
export function parseFreestyleMetadata(metadata: unknown): FreestyleMetadata {
  if (!metadata || typeof metadata !== "object") return {};
  const m = metadata as Record<string, unknown>;
  return {
    repo_url: typeof m.repo_url === "string" ? m.repo_url : null,
    freestyle_repo_id:
      typeof m.freestyle_repo_id === "string" ? m.freestyle_repo_id : null,
    freestyle_vm_id:
      typeof m.freestyle_vm_id === "string" ? m.freestyle_vm_id : null,
    freestyle_snapshot_id:
      typeof m.freestyle_snapshot_id === "string"
        ? m.freestyle_snapshot_id
        : null,
    runtime: m.runtime === "bun" ? "bun" : null,
    runtime_status:
      m.runtime_status === "idle" ||
      m.runtime_status === "installing" ||
      m.runtime_status === "running"
        ? m.runtime_status
        : null,
    running_script:
      typeof m.running_script === "string" ? m.running_script : null,
    vm_domain: typeof m.vm_domain === "string" ? m.vm_domain : null,
    scripts:
      m.scripts && typeof m.scripts === "object" && !Array.isArray(m.scripts)
        ? (m.scripts as Record<string, string>)
        : null,
    preview_port:
      typeof m.preview_port === "number" &&
      Number.isInteger(m.preview_port) &&
      m.preview_port >= 1 &&
      m.preview_port <= 65535
        ? m.preview_port
        : null,
    autorun: typeof m.autorun === "string" ? m.autorun : null,
  };
}

/**
 * Returns an object with all freestyle metadata fields set to null.
 * Used by the "Unlink" action to clear all repo state.
 */
export function emptyFreestyleMetadata(): Record<string, null> {
  return {
    repo_url: null,
    freestyle_repo_id: null,
    freestyle_vm_id: null,
    freestyle_snapshot_id: null,
    runtime: null,
    runtime_status: null,
    running_script: null,
    vm_domain: null,
    scripts: null,
    preview_port: null,
    autorun: null,
  };
}
