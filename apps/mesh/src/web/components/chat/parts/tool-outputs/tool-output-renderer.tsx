import { ConnectionCard } from "@/web/components/connections/connection-card.tsx";
import { useConnection } from "@/web/hooks/collections/use-connection";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Button } from "@deco/ui/components/button.tsx";
import { LinkExternal01, Copy01 } from "@untitledui/icons";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { JsonSyntaxHighlighter } from "@/web/components/json-syntax-highlighter.tsx";

interface ToolOutputRendererProps {
  toolName: string;
  input: unknown;
  output: unknown;
  isError?: boolean;
}

export function ToolOutputRenderer({
  toolName,
  input,
  output,
  isError: _isError,
}: ToolOutputRendererProps) {
  const stringifiedOutput = JSON.stringify(output, null, 2);
  const isLargeOutput = stringifiedOutput.length > 2000;
  const outputContent = isLargeOutput
    ? stringifiedOutput.slice(0, 2000) + "...[TRUNCATED]"
    : stringifiedOutput;
  // Handle READ_MCP_TOOLS
  if (toolName === "READ_MCP_TOOLS") {
    const connectionId = (input as { id: string })?.id;
    // If we have a connection ID, try to fetch and display the connection card
    if (connectionId) {
      return <ConnectionRenderer connectionId={connectionId} />;
    }
  }

  // Handle CALL_MCP_TOOL
  if (toolName === "CALL_MCP_TOOL") {
    const connectionId = (input as { connectionId: string })?.connectionId;
    return (
      <div className="flex flex-col gap-2">
        {connectionId && (
          <ConnectionRenderer connectionId={connectionId} compact />
        )}
        <div className="relative bg-muted rounded-md overflow-auto max-h-[200px]">
          <div className="absolute top-1 right-1 z-10">
            <CopyButton text={JSON.stringify(output, null, 2)} />
          </div>
          <div className="font-semibold text-muted-foreground mb-0.5 text-[10px] uppercase tracking-wider px-2 pt-2">
            Input
          </div>
          <div className="mb-2">
            <JsonSyntaxHighlighter
              jsonString={JSON.stringify(input, null, 2)}
              padding="0.5rem"
            />
          </div>
          <div className="font-semibold text-muted-foreground mb-0.5 text-[10px] uppercase tracking-wider px-2">
            Output
          </div>
          <div>
            <JsonSyntaxHighlighter
              jsonString={outputContent}
              padding="0.5rem"
            />
          </div>
        </div>
      </div>
    );
  }

  // Default fallback
  return <JsonSyntaxHighlighter jsonString={outputContent} padding="0" />;
}

function ConnectionRenderer({
  connectionId,
  compact,
}: {
  connectionId: string;
  compact?: boolean;
}) {
  const connection = useConnection(connectionId);
  const {
    org: { slug: org },
  } = useProjectContext();
  const navigate = useNavigate();

  if (!connection) return null;

  const handleOpen = () => {
    navigate({
      to: "/$org/mcps/$connectionId",
      params: { org, connectionId: connection.id },
    });
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md w-fit">
        <span className="font-medium text-foreground">{connection.title}</span>
        <button
          type="button"
          onClick={handleOpen}
          className="hover:text-foreground transition-colors"
          title="Open connection"
        >
          <LinkExternal01 size={12} />
        </button>
      </div>
    );
  }

  return <ConnectionCard connection={connection} onClick={handleOpen} />;
}

function CopyButton({ text }: { text: string }) {
  const handleCopy = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard");
      } else {
        throw new Error("Clipboard API unavailable");
      }
    } catch (err) {
      try {
        // Fallback method
        const textArea = document.createElement("textarea");
        textArea.value = text;

        // Ensure it's not visible but part of the DOM
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);

        textArea.focus();
        textArea.select();

        const successful = document.execCommand("copy");
        document.body.removeChild(textArea);

        if (successful) {
          toast.success("Copied to clipboard");
        } else {
          throw new Error("Fallback copy failed");
        }
      } catch (fallbackErr) {
        console.error("Copy failed", err, fallbackErr);
        toast.error("Failed to copy to clipboard");
      }
    }
  };

  return (
    <Button
      size="icon"
      variant="ghost"
      className="h-5 w-5 hover:bg-background/50"
      onClick={handleCopy}
    >
      <Copy01 size={12} />
    </Button>
  );
}
