import { cn } from "@deco/ui/lib/utils.ts";
import Placeholder from "@tiptap/extension-placeholder";
import type { EditorView } from "@tiptap/pm/view";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { Ref } from "react";
import { useEffect, useImperativeHandle, useRef } from "react";
import type { VirtualMCPInfo } from "../select-virtual-mcp";
import type { SelectedModelState } from "../select-model";
import type { Metadata } from "../types.ts";
import { FileNode, FileUploader, processFile } from "./file";
import { MentionNode } from "./mention";
import { PromptsMention } from "./mention-prompts.tsx";
import { ResourcesMention } from "./mention-resources.tsx";
import { Editor } from "@tiptap/core";

const GLOBAL_EXTENSIONS = [
  StarterKit.configure({
    heading: false,
    blockquote: false,
    codeBlock: false,
    horizontalRule: false,
  }),
  Placeholder.configure({
    placeholder:
      "Ask anything, use / for prompts, @ for resources, or drop files here...",
    showOnlyWhenEditable: false,
  }),
  MentionNode,
  FileNode,
];

export interface ChatTiptapInputHandle {
  focus: () => void;
  clear: () => void;
  insertFiles: (files: File[]) => Promise<void>;
}

interface ChatTiptapInputProps {
  isTranscribing: boolean;
  tiptapDoc: Metadata["tiptapDoc"];
  setTiptapDoc: (doc: Metadata["tiptapDoc"]) => void;
  selectedModel: SelectedModelState | null;
  isStreaming: boolean;
  selectedVirtualMcp: VirtualMCPInfo | null;
  onSubmit?: () => void;
}

export function ChatTiptapInput({
  ref,
  ...props
}: ChatTiptapInputProps & { ref?: Ref<ChatTiptapInputHandle> }) {
  const {
    tiptapDoc,
    setTiptapDoc,
    selectedModel,
    isStreaming,
    isTranscribing,
    selectedVirtualMcp,
    onSubmit,
  } = props;
  const virtualMcpId = selectedVirtualMcp?.id ?? null;
  const isDisabled = isStreaming || !selectedModel || isTranscribing;

  // Store onSubmit in a ref to avoid recreating the editor on every render
  const onSubmitRef = useRef(onSubmit);

  // Initialize Tiptap editor
  const editor = useEditor(
    {
      extensions: GLOBAL_EXTENSIONS,
      content: tiptapDoc || "",
      editable: !isDisabled,
      editorProps: {
        attributes: {
          class:
            "prose prose-sm max-w-none focus:outline-none w-full h-full text-[15px] p-[18px]",
        },
        handleKeyDown: (_view: EditorView, event: KeyboardEvent) => {
          // Handle Enter key: submit on Enter, new line on Shift+Enter
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmitRef.current?.();
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor }: { editor: Editor }) => {
        // Update tiptapDoc in context whenever editor changes
        setTiptapDoc(editor.getJSON());
      },
    },
    [isDisabled, setTiptapDoc],
  );

  useImperativeHandle(
    ref ?? null,
    () => ({
      focus: () => {
        editor?.commands.focus();
      },
      clear: () => {
        editor?.commands.clearContent(true);
      },
      insertFiles: async (files: File[]) => {
        if (!editor) return;

        // Get current cursor position
        const { from } = editor.state.selection;
        const currentPos = from;

        // Process files sequentially using the shared processFile function
        for (const file of files) {
          await processFile(editor, selectedModel, file, currentPos);
        }
      },
    }),
    [editor, selectedModel],
  );

  // Keep the ref up to date
  // eslint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  // Sync editor content when tiptapDoc changes externally
  // eslint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (editor.isDestroyed) return;

    // Only update if the content is different to avoid unnecessary updates
    const currentJson = JSON.stringify(editor.getJSON());
    const newJson = JSON.stringify(tiptapDoc || { type: "doc", content: [] });

    if (currentJson !== newJson) {
      editor.commands.setContent(tiptapDoc || { type: "doc", content: [] });
    }
  }, [editor, tiptapDoc]);

  return (
    <>
      <EditorContent
        editor={editor}
        className={cn(
          "overflow-y-auto relative flex-1 max-h-[164px] min-h-[20px] w-full flex flex-col",
          "[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[20px] [&_.ProseMirror]:flex-1",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0",
          isDisabled && "cursor-not-allowed opacity-70",
          isDisabled && "[&_.ProseMirror]:cursor-not-allowed",
        )}
      />

      {/* Render prompts dropdown menu (includes dialog) */}
      <PromptsMention editor={editor} virtualMcpId={virtualMcpId} />

      {/* Render resources dropdown menu */}
      <ResourcesMention editor={editor} virtualMcpId={virtualMcpId} />

      {/* Render file upload handler */}
      <FileUploader editor={editor} selectedModel={selectedModel} />
    </>
  );
}
