// @decocms/mesh-plugin-deco-blocks
// Deco blocks framework scanner, DECO_BLOCKS_BINDING, and Claude skill

// Public scanner API
export type { BlockDefinition, LoaderDefinition } from "./scanner.ts";
export { scanBlocks, scanLoaders } from "./scanner.ts";

// Binding helper
export { isDecoSite } from "./is-deco-site.ts";

// Re-export binding types for consumers who want them without importing @decocms/bindings directly
export { DECO_BLOCKS_BINDING, type DecoBlocksBinding } from "@decocms/bindings";

// Schema extraction helpers (exported for advanced use cases)
export {
  extractPropsSchema,
  extractReturnTypeSchema,
} from "./schema-extractor.ts";
