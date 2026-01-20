import type { JSONContent } from "@tiptap/react";
import type { TiptapDoc } from "../types";

/**
 * Create a Tiptap document from text
 */
export function createTiptapDoc(text: string): TiptapDoc {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text,
          },
        ],
      },
    ],
  };
}

/**
 * Check if a Tiptap document is empty
 */
export function isTiptapDocEmpty(doc: TiptapDoc | null | undefined): boolean {
  if (!doc) return true;
  if (!doc.content || doc.content.length === 0) return true;

  // Check if all content nodes are empty
  return doc.content.every((node) => {
    if (node.type === "paragraph") {
      if (!node.content || node.content.length === 0) return true;
      return node.content.every(
        (child) => child.type === "text" && (!child.text || child.text === ""),
      );
    }
    return false;
  });
}

/**
 * Append content to a Tiptap document
 */
export function appendToTiptapDoc(
  doc: TiptapDoc | null | undefined,
  content: JSONContent,
): TiptapDoc {
  return {
    type: "doc",
    content: [...(doc?.content ?? []), content].filter(Boolean),
  };
}
