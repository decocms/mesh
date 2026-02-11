import { cn } from "@deco/ui/lib/utils.ts";
import { useCopy } from "@deco/ui/hooks/use-copy.ts";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { type UIMessage } from "ai";
import { useState } from "react";
import { FileNode } from "../tiptap/file/node.tsx";
import { MentionNode } from "../tiptap/mention/node.tsx";
import type { Metadata } from "../types.ts";
import { MessageTextPart } from "./parts/text-part.tsx";

export interface MessageProps<T extends Metadata> {
  message: UIMessage<T>;
  status?: "streaming" | "submitted" | "ready" | "error";
  className?: string;
  onScrollToPair?: () => void;
}

function extractTextFromMessage<T extends Metadata>(
  message: UIMessage<T>,
): string {
  const { parts, metadata } = message;
  if (metadata?.tiptapDoc) {
    const walk = (node: {
      type?: string;
      text?: string;
      content?: unknown[];
    }): string => {
      if (!node) return "";
      if (node.type === "text" && typeof node.text === "string")
        return node.text;
      if (Array.isArray(node.content)) {
        return node.content
          .map((c) =>
            walk(c as { type?: string; text?: string; content?: unknown[] }),
          )
          .join("");
      }
      return "";
    };
    return walk(
      metadata.tiptapDoc as {
        type?: string;
        text?: string;
        content?: unknown[];
      },
    ).trim();
  }
  if (!parts?.length) return "";
  return parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
    .trim();
}

const EXTENSIONS = [
  StarterKit.configure({
    heading: false,
    blockquote: false,
    codeBlock: false,
    horizontalRule: false,
  }),
  MentionNode,
  FileNode,
];

/**
 * Read-only Tiptap renderer for rich message content
 */
function RichMessageContent({
  tiptapDoc,
}: {
  tiptapDoc: Metadata["tiptapDoc"];
}) {
  const editor = useEditor({
    extensions: EXTENSIONS,
    content: tiptapDoc,
    editable: false,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none",
      },
    },
  });

  if (!editor) return null;

  return (
    <EditorContent
      editor={editor}
      className="[&_.ProseMirror]:outline-none [&_.ProseMirror]:cursor-text"
    />
  );
}

export function MessageUser<T extends Metadata>({
  message,
  className,
  onScrollToPair,
}: MessageProps<T>) {
  const { id, parts, metadata } = message;
  const [isFocused, setIsFocused] = useState(false);
  const { handleCopy } = useCopy();

  // Early return if no parts
  if (!parts || parts.length === 0) {
    return null;
  }

  const handleClick = async () => {
    setIsFocused(true);
    onScrollToPair?.();
    const text = extractTextFromMessage(message);
    if (text) await handleCopy(text);
  };

  // Check if we have rich content to render
  const hasTiptapDoc = metadata?.tiptapDoc;

  return (
    <>
      <div
        className={cn(
          "message-block w-full min-w-0 relative flex items-start gap-4 px-2.5 text-foreground flex-row-reverse",
          className,
        )}
      >
        <div
          tabIndex={0}
          onClick={handleClick}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className="w-full border min-w-0 shadow-xs rounded-lg text-[0.9375rem] wrap-break-word overflow-wrap-anywhere bg-background cursor-pointer transition-colors relative flex outline-none"
        >
          <div
            className={cn(
              "z-10 px-4 py-2 transition-opacity max-h-[120px] flex-1",
              isFocused
                ? "overflow-auto opacity-100"
                : "overflow-hidden opacity-99 mask-b-from-1%",
            )}
          >
            <div>
              {hasTiptapDoc ? (
                <RichMessageContent tiptapDoc={metadata.tiptapDoc} />
              ) : (
                parts.map((part, index) => {
                  if (part.type === "text") {
                    return (
                      <MessageTextPart
                        key={`${id}-${index}`}
                        id={id}
                        part={part}
                      />
                    );
                  }
                  return null;
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
