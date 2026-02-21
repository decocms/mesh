import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@deco/ui/components/button.tsx";
import type { TypedToolCaller, DecoBlocksBinding, LoaderDefinition } from "@decocms/bindings";
import { listLoaders } from "../lib/block-api";
import { QUERY_KEYS } from "../lib/query-keys";

interface LoaderDrawerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (loader: LoaderDefinition, prop: string) => void;
  toolCaller: TypedToolCaller<DecoBlocksBinding>;
  projectId: string;
  targetProp?: string;
}

export function LoaderDrawer({
  open,
  onClose,
  onSelect,
  toolCaller,
  projectId,
  targetProp,
}: LoaderDrawerProps) {
  const { data: loaders = [] } = useQuery({
    queryKey: QUERY_KEYS.loaders(projectId),
    queryFn: () => listLoaders(toolCaller),
    enabled: open,
  });

  if (!open) return null;

  return (
    <div className="absolute inset-y-0 right-0 w-72 bg-background border-l shadow-lg flex flex-col z-10">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-sm font-medium">
          Bind loader{targetProp ? ` \u2192 ${targetProp}` : ""}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClose}
        >
          <X size={12} />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
        {loaders.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No loaders found
          </p>
        ) : (
          loaders.map((loader) => (
            <Button
              key={loader.name}
              variant="ghost"
              className="justify-start h-auto py-2 px-3"
              onClick={() => {
                onSelect(loader, targetProp ?? "");
                onClose();
              }}
            >
              <div className="text-left">
                <div className="text-sm font-medium">{loader.name}</div>
                <div className="text-xs text-muted-foreground">loader</div>
              </div>
            </Button>
          ))
        )}
      </div>
    </div>
  );
}
