/**
 * Site Builder Binding
 *
 * Extends OBJECT_STORAGE_BINDING to inherit file operations.
 * Site detection is done via runtime file checks (deno.json with deco imports),
 * not via additional binding requirements.
 */

import { OBJECT_STORAGE_BINDING } from "@decocms/bindings";
import type { Binder } from "@decocms/bindings";

/**
 * Site Builder uses the same binding as object storage.
 * Connection filtering for "site" detection happens at runtime
 * by checking for deno.json with deco/ imports.
 */
export const SITE_BUILDER_BINDING = [
  ...OBJECT_STORAGE_BINDING,
] as const satisfies Binder;

export type SiteBuilderBinding = typeof SITE_BUILDER_BINDING;
