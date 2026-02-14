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
} as const;
