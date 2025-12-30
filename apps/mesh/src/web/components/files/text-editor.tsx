/**
 * TextEditor Component
 *
 * Monaco-based text editor with save functionality.
 * Lazy-loaded to avoid loading Monaco on initial page load.
 */

import { Suspense, lazy, useState } from "react";
import { Loading01, Save01 } from "@untitledui/icons";
import { useFileMutations } from "@/web/hooks/use-file-storage";
import type { FileEntity } from "@decocms/bindings/file-storage";
import { Button } from "@deco/ui/components/button.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { toast } from "sonner";

// Lazy load Monaco editor
const Editor = lazy(() => import("@monaco-editor/react"));

interface TextEditorProps {
  connectionId: string;
  file: FileEntity;
  initialContent: string;
  className?: string;
}

/**
 * Get Monaco language from MIME type or file extension
 */
function getLanguage(mimeType: string, fileName: string): string {
  // Check MIME type first
  if (mimeType === "application/json") return "json";
  if (mimeType === "application/javascript") return "javascript";
  if (mimeType === "application/xml") return "xml";
  if (mimeType === "text/html") return "html";
  if (mimeType === "text/css") return "css";
  if (mimeType === "text/markdown") return "markdown";
  if (mimeType === "text/yaml" || mimeType === "application/x-yaml")
    return "yaml";

  // Fall back to file extension
  const ext = fileName.split(".").pop()?.toLowerCase();
  const extMap: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    json: "json",
    md: "markdown",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    less: "less",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    sql: "sql",
    graphql: "graphql",
    gql: "graphql",
  };

  return extMap[ext ?? ""] ?? "plaintext";
}

/**
 * Loading fallback for Monaco
 */
function EditorLoading() {
  return (
    <div className="flex items-center justify-center h-full bg-muted/20">
      <div className="flex flex-col items-center gap-3">
        <Loading01 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading editor...</span>
      </div>
    </div>
  );
}

/**
 * Text editor with Monaco and save functionality
 */
export function TextEditor({
  connectionId,
  file,
  initialContent,
  className,
}: TextEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [hasChanges, setHasChanges] = useState(false);
  const fileMutations = useFileMutations(connectionId);

  const language = getLanguage(file.mimeType, file.title);

  const handleEditorChange = (value: string | undefined) => {
    const newContent = value ?? "";
    setContent(newContent);
    setHasChanges(newContent !== initialContent);
  };

  const handleSave = async () => {
    try {
      await fileMutations.write.mutateAsync({
        path: file.path,
        content,
        encoding: "utf-8",
      });
      setHasChanges(false);
      toast.success("File saved");
    } catch (error) {
      console.error("Failed to save file:", error);
      toast.error("Failed to save file");
    }
  };

  // Handle Ctrl/Cmd+S
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      if (hasChanges) {
        handleSave();
      }
    }
  };

  return (
    <div
      className={cn("flex flex-col h-full", className)}
      onKeyDown={handleKeyDown}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground uppercase">
            {language}
          </span>
          {hasChanges && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              • Unsaved changes
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant={hasChanges ? "default" : "ghost"}
          onClick={handleSave}
          disabled={!hasChanges || fileMutations.isSaving}
          className="h-7"
        >
          {fileMutations.isSaving ? (
            <Loading01 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save01 className="mr-2 h-4 w-4" />
          )}
          {fileMutations.isSaving ? "Saving..." : "Save"}
        </Button>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={<EditorLoading />}>
          <Editor
            height="100%"
            language={language}
            value={content}
            onChange={handleEditorChange}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: "on",
              wordWrap: "on",
              automaticLayout: true,
              scrollBeyondLastLine: false,
              padding: { top: 12, bottom: 12 },
              renderLineHighlight: "gutter",
              folding: true,
              bracketPairColorization: { enabled: true },
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}
