import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import type { TypedToolCaller, DecoBlocksBinding, BlockDefinition } from "@decocms/bindings";
import { listBlocks } from "../lib/block-api";
import { QUERY_KEYS } from "../lib/query-keys";

interface BlockPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (block: BlockDefinition) => void;
  toolCaller: TypedToolCaller<DecoBlocksBinding>;
  projectId: string;
}

export function BlockPicker({
  open,
  onClose,
  onSelect,
  toolCaller,
  projectId,
}: BlockPickerProps) {
  const [search, setSearch] = useState("");

  const { data: blocks = [] } = useQuery({
    queryKey: QUERY_KEYS.blocks(projectId),
    queryFn: () => listBlocks(toolCaller),
    enabled: open,
  });

  const filtered = search
    ? blocks.filter((b) =>
        b.name.toLowerCase().includes(search.toLowerCase()),
      )
    : blocks;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add section</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Search blocks..."
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setSearch(e.target.value)
          }
          autoFocus
        />
        <div className="max-h-80 overflow-y-auto flex flex-col gap-1 mt-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No blocks found
            </p>
          ) : (
            filtered.map((block) => (
              <Button
                key={block.name}
                variant="ghost"
                className="justify-start h-auto py-2 px-3"
                onClick={() => {
                  onSelect(block);
                  onClose();
                }}
              >
                <div className="text-left">
                  <div className="text-sm font-medium">{block.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {block.kind}
                  </div>
                </div>
              </Button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
