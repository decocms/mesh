/**
 * Site Builder Binding
 *
 * Extends OBJECT_STORAGE_BINDING to inherit file operations.
 * Site detection is done via runtime file checks (deno.json with deco imports),
 * not via additional binding requirements.
 *
 * Optional tools like DENO_TASK/EXEC are checked at runtime via connection.tools
 * rather than being part of the binding (since they may not be available on all MCPs).
 */

import { OBJECT_STORAGE_BINDING } from "@decocms/bindings";
import type { Binder } from "@decocms/bindings";

/**
 * Site Builder uses object storage binding.
 * Connection filtering for "site" detection happens at runtime
 * by checking for deno.json with deco/ imports.
 *
 * Optional tools (DENO_TASK, EXEC) are checked dynamically at runtime.
 */
export const SITE_BUILDER_BINDING = [
  ...OBJECT_STORAGE_BINDING,
] as const satisfies Binder;

export type SiteBuilderBinding = typeof SITE_BUILDER_BINDING;
