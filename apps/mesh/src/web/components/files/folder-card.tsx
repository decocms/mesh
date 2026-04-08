/**
 * FolderCard - Visual card for a folder in the file browser.
 */

import { cn } from "@deco/ui/lib/utils.ts";
import { FolderClosed } from "@untitledui/icons";
import type { Folder } from "@/web/lib/mock-artifacts";

export function FolderCard({
  folder,
  onClick,
}: {
  folder: Folder;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-2.5 p-4 rounded-xl text-center",
        "border border-border bg-card",
        "transition-all hover:border-foreground/20 hover:shadow-sm cursor-pointer group",
        "w-full min-w-[120px]",
      )}
    >
      <div
        className="flex items-center justify-center size-12 rounded-xl transition-transform group-hover:scale-110"
        style={{ backgroundColor: `${folder.color}15` }}
      >
        <FolderClosed size={24} style={{ color: folder.color }} />
      </div>
      <div className="min-w-0 w-full">
        <p className="text-sm font-medium text-foreground truncate">
          {folder.title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {folder.itemCount} {folder.itemCount === 1 ? "item" : "items"}
        </p>
      </div>
    </button>
  );
}
