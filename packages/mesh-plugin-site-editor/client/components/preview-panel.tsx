import { MousePointer2, Edit3 } from "lucide-react";
import { Button } from "@deco/ui/components/button.tsx";
import type {
  UseIframeBridgeResult,
  IframeMode,
} from "../lib/use-iframe-bridge";

interface PreviewPanelProps {
  previewUrl: string | null | undefined;
  mode: IframeMode;
  onModeChange: (mode: IframeMode) => void;
  bridge: UseIframeBridgeResult;
}

export function PreviewPanel({
  previewUrl,
  mode,
  onModeChange,
  bridge,
}: PreviewPanelProps) {
  if (!previewUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
        <div className="text-4xl">🖥️</div>
        <h3 className="text-sm font-medium">No preview available</h3>
        <p className="text-xs text-muted-foreground max-w-xs">
          Run{" "}
          <code className="bg-muted px-1 rounded text-xs">
            deco link ./folder
          </code>{" "}
          to start the dev server and connect preview.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
        <span className="text-xs text-muted-foreground truncate">
          {previewUrl}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant={mode === "edit" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => onModeChange("edit")}
          >
            <Edit3 size={10} className="mr-1" />
            Edit
          </Button>
          <Button
            variant={mode === "interact" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => onModeChange("interact")}
          >
            <MousePointer2 size={10} className="mr-1" />
            Interact
          </Button>
        </div>
      </div>
      <div className="flex-1 relative">
        <iframe
          ref={bridge.setIframeRef}
          src={previewUrl}
          title="Site preview"
          className="w-full h-full border-0"
          style={{ pointerEvents: mode === "interact" ? "auto" : "none" }}
        />
        {/* Overlay to block clicks in edit mode while preserving iframe visibility */}
        {mode === "edit" && <div className="absolute inset-0 cursor-default" />}
      </div>
    </div>
  );
}
