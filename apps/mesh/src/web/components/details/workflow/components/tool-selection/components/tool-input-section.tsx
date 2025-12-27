import { Play, Loader2 } from "lucide-react";
import { Button } from "@deco/ui/components/button.tsx";

export function ToolInputSection({
  isExecuting,
  onExecute,
  showExecuteButton,
  children,
}: {
  isExecuting: boolean;
  onExecute: () => void;
  showExecuteButton: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full h-full flex flex-col">
      <div className="h-10 flex items-center justify-between px-4 py-2 border-y border-border">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-sm bg-primary/10 flex items-center justify-center">
            <Play className="h-3 w-3 text-primary" />
          </div>
          <span className="font-medium text-sm">Input</span>
        </div>
        {showExecuteButton && (
          <Button
            size="sm"
            variant="default"
            className="h-8 gap-2"
            onClick={onExecute}
            disabled={isExecuting}
          >
            {isExecuting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            Execute tool
          </Button>
        )}
      </div>
      <div className="pb-8">
        <div className="p-4 space-y-4">{children}</div>
      </div>
    </div>
  );
}
