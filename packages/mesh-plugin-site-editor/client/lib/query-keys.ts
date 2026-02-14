/**
 * React Query keys for Site Editor plugin
 */

export const queryKeys = {
  pages: {
    all: (connectionId: string) =>
      ["site-editor", "pages", connectionId] as const,
    detail: (connectionId: string, pageId: string) =>
      ["site-editor", "pages", connectionId, pageId] as const,
  },
  blocks: {
    all: (connectionId: string) =>
      ["site-editor", "blocks", connectionId] as const,
    detail: (connectionId: string, blockId: string) =>
      ["site-editor", "blocks", connectionId, blockId] as const,
  },
} as const;

/** Shorthand for block query keys */
export const blockKeys = queryKeys.blocks;
