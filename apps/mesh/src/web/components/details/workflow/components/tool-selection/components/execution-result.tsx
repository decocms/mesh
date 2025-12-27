import { Copy } from "lucide-react";
import { Button } from "@deco/ui/components/button.tsx";
import { toast } from "@deco/ui/components/sonner.tsx";
import { MonacoCodeEditor } from "../../monaco-editor";

export function ExecutionResult({
  executionResult,
}: {
  executionResult: Record<string, unknown> | null;
}) {
  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(executionResult, null, 2));
    toast.success("Copied to clipboard");
  };
  return (
    <div className="w-full shadow-sm h-full border-t border-border">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
          Execution Result
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={handleCopy}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>

      <MonacoCodeEditor
        code={JSON.stringify(executionResult, null, 2)}
        language="json"
        readOnly
        foldOnMount
      />
    </div>
  );
}
