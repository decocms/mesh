// @decocms/mesh-plugin-deco-blocks
// Deco blocks framework scanner, DECO_BLOCKS_BINDING, and Claude skill

// Public scanner API
export type { BlockDefinition, LoaderDefinition } from "./scanner.ts";
export { scanBlocks, scanLoaders } from "./scanner.ts";

// Schema extraction helpers (exported for advanced use cases)
export { extractPropsSchema, extractReturnTypeSchema } from "./schema-extractor.ts";
