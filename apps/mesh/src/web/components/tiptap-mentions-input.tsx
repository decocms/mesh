import {
  useEditor,
  EditorContent,
  ReactRenderer,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import { cn } from "@deco/ui/lib/utils.ts";
import { createStore } from "zustand";
import { useStore } from "zustand";

// --- Types ---

export interface MentionItem {
  id: string;
  label: string;
  children?: MentionItem[];
}

interface MentionState {
  path: MentionItem[];
  items: MentionItem[];
  rootItems: MentionItem[];
  selectedIndex: number;
  command: ((item: MentionItem) => void) | null;
}

// --- Module-level store (singleton per popup lifecycle) ---

let mentionStore = createMentionStore();

function createMentionStore() {
  return createStore<MentionState>(() => ({
    path: [],
    items: [],
    rootItems: [],
    selectedIndex: 0,
    command: null,
  }));
}

function setItems(items: MentionItem[], command: (item: MentionItem) => void) {
  mentionStore.setState({
    items,
    rootItems: items,
    command,
    selectedIndex: 0,
    path: [],
  });
}

function moveUp() {
  const { items, selectedIndex } = mentionStore.getState();
  if (!items.length) return;
  mentionStore.setState({
    selectedIndex: (selectedIndex - 1 + items.length) % items.length,
  });
}

function moveDown() {
  const { items, selectedIndex } = mentionStore.getState();
  if (!items.length) return;
  mentionStore.setState({ selectedIndex: (selectedIndex + 1) % items.length });
}

function drillIn(): boolean {
  const { items, selectedIndex, path } = mentionStore.getState();
  const item = items[selectedIndex];
  if (!item?.children?.length) return false;
  mentionStore.setState({
    path: [...path, item],
    items: item.children,
    selectedIndex: 0,
  });
  return true;
}

function selectItem(): boolean {
  const { items, selectedIndex, command } = mentionStore.getState();
  const item = items[selectedIndex];
  if (!item) return false;
  if (item.children?.length) return false;
  command?.(item);
  return true;
}

function goBack(): boolean {
  const { path, rootItems } = mentionStore.getState();
  if (path.length === 0) return false;
  const newPath = path.slice(0, -1);
  const parent = newPath[newPath.length - 1];
  mentionStore.setState({
    path: newPath,
    items: parent?.children ?? rootItems,
    selectedIndex: 0,
  });
  return true;
}

function reset() {
  mentionStore = createMentionStore();
}

// --- Mention List Component ---

function MentionList() {
  const items = useStore(mentionStore, (s) => s.items);
  const selectedIndex = useStore(mentionStore, (s) => s.selectedIndex);
  const path = useStore(mentionStore, (s) => s.path);

  if (!items.length) return null;

  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg overflow-hidden min-w-[180px]">
      {path.length > 0 && (
        <button
          type="button"
          onClick={goBack}
          className="flex items-center gap-1.5 w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted border-b border-border"
        >
          ← {path[path.length - 1]?.label}
        </button>
      )}
      <div className="p-1">
        {items.map((item, index) => (
          <button
            type="button"
            key={item.id}
            onClick={() => {
              mentionStore.setState({ selectedIndex: index });
              if (!drillIn()) selectItem();
            }}
            className={cn(
              "flex items-center justify-between w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors",
              index === selectedIndex
                ? "bg-accent text-accent-foreground"
                : "hover:bg-muted",
            )}
          >
            <span>{item.label}</span>
            {item.children?.length ? (
              <span className="text-muted-foreground text-xs">→</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Suggestion Renderer ---

interface SuggestionProps {
  editor: Editor;
  items: MentionItem[];
  command: (item: MentionItem) => void;
  clientRect?: (() => DOMRect | null) | null;
}

function suggestionRenderer() {
  let component: ReactRenderer | null = null;
  let popup: HTMLElement | null = null;

  return {
    onStart: (props: SuggestionProps) => {
      setItems(props.items, props.command);
      component = new ReactRenderer(MentionList, { editor: props.editor });
      popup = document.createElement("div");
      popup.style.cssText = "position:absolute;z-index:9999";
      const rect = props.clientRect?.();
      if (rect) {
        popup.style.top = `${rect.bottom + window.scrollY + 4}px`;
        popup.style.left = `${rect.left + window.scrollX}px`;
      }
      popup.appendChild(component.element);
      document.body.appendChild(popup);
    },
    onUpdate: (props: SuggestionProps) => {
      setItems(props.items, props.command);
      const rect = props.clientRect?.();
      if (rect && popup) {
        popup.style.top = `${rect.bottom + window.scrollY + 4}px`;
        popup.style.left = `${rect.left + window.scrollX}px`;
      }
    },
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "Escape") {
        popup?.remove();
        component?.destroy();
        reset();
        return true;
      }
      if (event.key === "ArrowUp") {
        moveUp();
        return true;
      }
      if (event.key === "ArrowDown") {
        moveDown();
        return true;
      }
      if (event.key === "ArrowRight") {
        return drillIn();
      }
      if (event.key === "ArrowLeft") {
        return goBack();
      }
      if (event.key === "Enter") {
        const { items, selectedIndex } = mentionStore.getState();
        const item = items[selectedIndex];
        if (item?.children?.length) return drillIn();
        return selectItem();
      }
      return false;
    },
    onExit: () => {
      popup?.remove();
      component?.destroy();
      reset();
    },
  };
}

// --- Reusable Hook ---

interface UseMentionEditorOptions {
  mentions: MentionItem[];
  multiline?: boolean;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: () => void;
}

function useMentionEditor({
  mentions,
  multiline = false,
  placeholder = "",
  value,
  onChange,
  onSubmit,
}: UseMentionEditorOptions) {
  return useEditor({
    content: value,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        hardBreak: multiline ? {} : false,
      }),
      Mention.configure({
        HTMLAttributes: {
          class: "bg-primary/20 text-primary px-1 rounded font-medium",
        },
        renderText: ({ node }) => `@${node.attrs.id}`,
        renderHTML: ({ options, node }) => [
          "span",
          options.HTMLAttributes,
          `@${node.attrs.id}`,
        ],
        suggestion: {
          items: ({ query }: { query: string }) =>
            mentions.filter((m) =>
              m.label.toLowerCase().includes(query.toLowerCase()),
            ),
          render: suggestionRenderer,
          command: ({ editor, range, props }) => {
            // Insert mention without trailing space
            editor
              .chain()
              .focus()
              .insertContentAt(range, [
                {
                  type: "mention",
                  attrs: props,
                },
              ])
              .run();
          },
        },
      }),
    ],
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none focus:outline-none w-full",
          multiline ? "min-h-[80px]" : "min-h-[20px]",
        ),
        "data-placeholder": placeholder,
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && !event.shiftKey && !multiline) {
          event.preventDefault();
          onSubmit?.();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => onChange?.(editor.getText().trim()),
  });
}

// --- Components ---

interface MentionInputProps {
  mentions: MentionItem[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
}

export function MentionInput({
  mentions,
  value,
  onChange,
  placeholder,
  className,
  multiline = false,
}: MentionInputProps) {
  const editor = useMentionEditor({
    mentions,
    multiline,
    placeholder,
    value,
    onChange,
  });

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        multiline && "min-h-[80px]",
        className,
      )}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
