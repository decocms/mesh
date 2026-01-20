import { cn } from "@deco/ui/lib/utils.ts";
import { JSONContent, Node } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type Editor,
  type NodeViewProps,
  type Range,
} from "@tiptap/react";
import { TiptapDoc } from "../../types";

// ============================================================================
// Mention Attributes (shared between MentionNode and mention insertion)
// ============================================================================

export interface MentionAttrs<T = unknown> {
  /** Unique identifier for the mention */
  id: string;
  /** Machine-readable name */
  name: string;
  /** Additional metadata (e.g., prompt messages) */
  metadata: T;
  /** Character that triggered the mention */
  char?: "/" | "@";
}

// ============================================================================
// Insert Mention Helper
// ============================================================================

/**
 * Inserts a mention node into the editor at the specified range.
 * @param editor - The Tiptap editor instance
 * @param range - The range where the mention should be inserted
 * @param attrs - The mention attributes
 */
export function insertMention<T>(
  editor: Editor,
  range: Range,
  attrs: MentionAttrs<T>,
): void {
  editor
    .chain()
    .focus()
    .insertContentAt(range, [
      createMentionDoc<T>(attrs),
      { type: "text", text: " " },
    ])
    .run();
}

export function createMentionDoc<T>(attrs: MentionAttrs<T>): JSONContent {
  return {
    type: "mention",
    attrs: attrs satisfies MentionAttrs<T>,
  };
}

// ============================================================================
// React Node View Component
// ============================================================================

function MentionNodeView(props: NodeViewProps) {
  const { node, selected } = props;
  const { name, char } = node.attrs as MentionAttrs;

  return (
    <NodeViewWrapper
      className={cn(
        "px-1 py-1 rounded",
        "inline-flex items-center gap-1",
        "cursor-default select-none",
        "text-xs font-light",
        "bg-amber-100 text-amber-700",
        selected && "outline-2 outline-blue-300 outline-offset-0",
      )}
    >
      {char}
      {name}
    </NodeViewWrapper>
  );
}

// ============================================================================
// Extension
// ============================================================================

export const MentionNode = Node.create({
  name: "mention",

  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-id") || null,
        renderHTML: (attributes) => {
          if (!attributes.id) return {};
          return { "data-id": attributes.id };
        },
      },
      name: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-name") || null,
        renderHTML: (attributes) => {
          if (!attributes.name) return {};
          return { "data-name": attributes.name };
        },
      },
      char: {
        default: "/",
        parseHTML: (element) => element.getAttribute("data-char") || "/",
        renderHTML: (attributes) => {
          if (!attributes.char) return {};
          return { "data-char": attributes.char };
        },
      },
      metadata: {
        default: null,
        parseHTML: (element) =>
          JSON.parse(element.getAttribute("data-metadata") || "null"),
        renderHTML: (attributes) => {
          if (!attributes.metadata) return {};
          return { "data-metadata": JSON.stringify(attributes.metadata) };
        },
      },
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    // Required by ProseMirror (maps to toDOM)
    // React component handles actual visual rendering
    const attrs: Record<string, string> = {};

    if (node.attrs.id) {
      attrs["data-id"] = node.attrs.id;
    }
    if (node.attrs.name) {
      attrs["data-name"] = node.attrs.name;
    }
    if (node.attrs.char) {
      attrs["data-char"] = node.attrs.char;
    }
    if (node.attrs.metadata) {
      attrs["data-metadata"] = JSON.stringify(node.attrs.metadata);
    }

    return ["span", { ...HTMLAttributes, ...attrs }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MentionNodeView);
  },
});
