import { cn } from "@deco/ui/lib/utils.ts";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { type UIMessage } from "ai";
import { useContext, useState } from "react";
import type { Metadata } from "../types.ts";
import { MessageListContext } from "./list.tsx";
import { MessageTextPart } from "./parts/text-part.tsx";
import { FileNode } from "../tiptap/file/node.tsx";
import { MentionNode } from "../tiptap/mention/node.tsx";

export interface MessageProps<T extends Metadata> {
  message: UIMessage<T>;
  status?: "streaming" | "submitted" | "ready" | "error";
  className?: string;
  pairIndex?: number;
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
  pairIndex,
}: MessageProps<T>) {
  const { id, parts, metadata } = message;
  const messageListContext = useContext(MessageListContext);
  const [isFocused, setIsFocused] = useState(false);

  // Early return if no parts
  if (!parts || parts.length === 0) {
    return null;
  }

  const handleClick = () => {
    setIsFocused(true);
    if (pairIndex !== undefined) {
      messageListContext?.scrollToPair(pairIndex);
    }
  };

  // Check if we have rich content to render
  const hasTiptapDoc = metadata?.tiptapDoc;

  return (
    <>
      <div
        className={cn(
          "message-block w-full min-w-0 group relative flex items-start gap-4 px-2.5 text-foreground flex-row-reverse",
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
