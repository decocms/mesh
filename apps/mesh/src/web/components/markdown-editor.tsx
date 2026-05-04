import { cn } from "@deco/ui/lib/utils.ts";
import type { JSONContent } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import { DOMParser as PMDOMParser } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { marked } from "marked";
// oxlint-disable-next-line ban-use-effect/ban-use-effect
import { useEffect, useRef } from "react";

// Parses pasted plain text as markdown by converting to HTML first
// Always treats pasted plain text as markdown. We don't trust the clipboard's
// HTML version because rendered views often wrap raw markdown source in <p>/<span>
// (so `# title` paste loses heading semantics). The plain-text version is the
// reliable source of truth for a markdown editor.
export const MarkdownPaste = Extension.create({
  name: "markdownPaste",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData("text/plain");
            if (!text) return false;
            event.preventDefault();

            const html = marked.parse(text, { async: false }) as string;
            const dom = document.createElement("div");
            dom.innerHTML = html;

            const slice = PMDOMParser.fromSchema(view.state.schema).parseSlice(
              dom,
            );
            view.dispatch(view.state.tr.replaceSelection(slice));
            return true;
          },
        },
      }),
    ];
  },
});

function serializeInline(nodes: JSONContent[]): string {
  return nodes
    .map((n) => {
      if (n.type === "hardBreak") return "\n";
      if (n.type !== "text") return "";
      let t = n.text ?? "";
      const marks = n.marks ?? [];
      if (marks.some((m) => m.type === "code")) return `\`${t}\``;
      const bold = marks.some((m) => m.type === "bold");
      const italic = marks.some((m) => m.type === "italic");
      if (bold && italic) return `***${t}***`;
      if (bold) t = `**${t}**`;
      if (italic) t = `*${t}*`;
      if (marks.some((m) => m.type === "strike")) t = `~~${t}~~`;
      const link = marks.find((m) => m.type === "link");
      if (link) return `[${t}](${link.attrs?.href ?? ""})`;
      return t;
    })
    .join("");
}

function serializeListItem(
  item: JSONContent,
  bullet: string,
  depth: number,
): string {
  const indent = "  ".repeat(depth);
  const lines: string[] = [];
  for (const child of item.content ?? []) {
    if (child.type === "paragraph") {
      lines.push(serializeInline(child.content ?? []));
    } else if (child.type === "bulletList" || child.type === "orderedList") {
      lines.push(tiptapToMarkdown({ type: "doc", content: [child] }));
    }
  }
  const [first, ...rest] = lines.join("\n").split("\n");
  return [
    `${indent}${bullet} ${first}`,
    ...rest.map((l) => `${indent}  ${l}`),
  ].join("\n");
}

function serializeCell(cell: JSONContent): string {
  return (cell.content ?? [])
    .map((p) => serializeInline(p.content ?? []))
    .join(" ")
    .replace(/\|/g, "\\|");
}

function serializeTable(node: JSONContent): string {
  const rows = node.content ?? [];
  if (rows.length === 0) return "";

  const matrix = rows.map((row) =>
    (row.content ?? []).map((cell) => serializeCell(cell)),
  );
  const cols = Math.max(...matrix.map((r) => r.length));

  const firstRow = rows[0];
  const hasHeader = (firstRow?.content ?? []).some(
    (c) => c.type === "tableHeader",
  );

  const lines: string[] = [];
  if (hasHeader) {
    lines.push("| " + (matrix[0] ?? []).join(" | ") + " |");
    lines.push("| " + Array(cols).fill("---").join(" | ") + " |");
    for (const row of matrix.slice(1)) {
      lines.push("| " + row.join(" | ") + " |");
    }
  } else {
    // No header row in source — synthesize an empty header so it stays valid GFM
    lines.push("| " + Array(cols).fill("").join(" | ") + " |");
    lines.push("| " + Array(cols).fill("---").join(" | ") + " |");
    for (const row of matrix) {
      lines.push("| " + row.join(" | ") + " |");
    }
  }

  return lines.join("\n");
}

function tiptapToMarkdown(doc: JSONContent): string {
  const blocks = (doc?.content ?? []).map((node): string => {
    switch (node.type) {
      case "heading":
        return (
          "#".repeat(node.attrs?.level ?? 1) +
          " " +
          serializeInline(node.content ?? [])
        );
      case "paragraph":
        return serializeInline(node.content ?? []);
      case "bulletList":
        return (node.content ?? [])
          .map((item) => serializeListItem(item, "-", 0))
          .join("\n");
      case "orderedList":
        return (node.content ?? [])
          .map((item, i) => serializeListItem(item, `${i + 1}.`, 0))
          .join("\n");
      case "codeBlock": {
        const lang = node.attrs?.language ?? "";
        const code = serializeInline(node.content ?? []);
        return `\`\`\`${lang}\n${code}\n\`\`\``;
      }
      case "blockquote":
        return (node.content ?? [])
          .map((n) => tiptapToMarkdown({ type: "doc", content: [n] }))
          .join("\n")
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n");
      case "horizontalRule":
        return "---";
      case "table":
        return serializeTable(node);
      default:
        return "";
    }
  });

  return blocks.filter(Boolean).join("\n\n").trim();
}

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  disabled = false,
  className,
}: MarkdownEditorProps) {
  const placeholderRef = useRef(placeholder);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    placeholderRef.current = placeholder;
  }, [placeholder]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ dropcursor: false }),
      Placeholder.configure({
        placeholder: () => placeholderRef.current ?? "",
        showOnlyWhenEditable: false,
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      MarkdownPaste,
    ],
    // marked.parse returns HTML which Tiptap accepts directly as initial content
    content: marked.parse(value || "") as string,
    editorProps: {
      attributes: {
        class:
          "outline-none focus:outline-none w-full min-h-[inherit] leading-relaxed",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(tiptapToMarkdown(editor.getJSON()));
    },
  });

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  // Sync external value changes (e.g., after "Improve")
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const currentMd = tiptapToMarkdown(editor.getJSON());
    if (currentMd !== value) {
      editor.commands.setContent(marked.parse(value ?? "") as string);
    }
  }, [editor, value]);

  return (
    <EditorContent
      editor={editor}
      onBlur={onBlur}
      className={cn(
        "overflow-y-auto w-full outline-none",
        "[&_.ProseMirror]:outline-none",
        // Placeholder
        "[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
        "[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground/40",
        "[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left",
        "[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none",
        "[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0",
        // Headings
        "[&_.ProseMirror_h1]:text-[1.25em] [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:leading-snug [&_.ProseMirror_h1]:mt-4 [&_.ProseMirror_h1]:mb-1",
        "[&_.ProseMirror_h2]:text-[1.1em] [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:leading-snug [&_.ProseMirror_h2]:mt-3 [&_.ProseMirror_h2]:mb-0.5",
        "[&_.ProseMirror_h3]:text-[1em] [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:leading-snug [&_.ProseMirror_h3]:mt-2",
        "[&_.ProseMirror_>*:first-child]:mt-0",
        // Lists
        "[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ul]:my-1",
        "[&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_ol]:my-1",
        // Blockquote
        "[&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-muted-foreground/30 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_blockquote]:text-muted-foreground",
        // Code
        "[&_.ProseMirror_code]:bg-muted [&_.ProseMirror_code]:rounded-sm [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:text-[0.85em] [&_.ProseMirror_code]:font-mono",
        "[&_.ProseMirror_pre]:bg-muted [&_.ProseMirror_pre]:rounded-lg [&_.ProseMirror_pre]:p-3 [&_.ProseMirror_pre]:my-2 [&_.ProseMirror_pre]:overflow-x-auto",
        "[&_.ProseMirror_pre_code]:bg-transparent [&_.ProseMirror_pre_code]:p-0 [&_.ProseMirror_pre_code]:text-sm",
        // HR
        "[&_.ProseMirror_hr]:border-border [&_.ProseMirror_hr]:my-3",
        // Table
        "[&_.ProseMirror_table]:border-collapse [&_.ProseMirror_table]:my-2 [&_.ProseMirror_table]:w-full [&_.ProseMirror_table]:text-sm",
        "[&_.ProseMirror_th]:border [&_.ProseMirror_th]:border-border [&_.ProseMirror_th]:px-2 [&_.ProseMirror_th]:py-1 [&_.ProseMirror_th]:bg-muted [&_.ProseMirror_th]:font-semibold [&_.ProseMirror_th]:text-left",
        "[&_.ProseMirror_td]:border [&_.ProseMirror_td]:border-border [&_.ProseMirror_td]:px-2 [&_.ProseMirror_td]:py-1",
        disabled && "cursor-not-allowed opacity-70",
        disabled && "[&_.ProseMirror]:cursor-not-allowed",
        className,
      )}
    />
  );
}
