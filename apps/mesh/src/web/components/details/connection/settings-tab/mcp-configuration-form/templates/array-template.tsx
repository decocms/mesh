/**
 * Array Field Template
 *
 * Renders array fields with add/remove controls.
 * Each item has a drag handle, input, and remove button.
 */

import type { ArrayFieldTemplateProps } from "@rjsf/utils";
import { Button } from "@deco/ui/components/button.tsx";
import { Plus, Trash01, DotsGrid } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import { formatTitle } from "../utils";

export function CustomArrayFieldTemplate(props: ArrayFieldTemplateProps) {
  const { items, canAdd, onAddClick, title } = props;

  // Get item label for better UX
  const itemLabel = title ? formatTitle(title).replace(/s$/, "") : "Item";

  return (
    <div className="space-y-2">
      {/* Array items */}
      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-md">
          No items added yet
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((item, index) => (
            <div
              key={item.key}
              className={cn(
                "group flex gap-2 items-center p-2 rounded-md border border-border",
                "hover:bg-muted/30 transition-all"
              )}
            >
              {/* Drag handle icon (visual only for now) */}
              <div className="shrink-0 text-muted-foreground cursor-grab">
                <DotsGrid size={16} />
              </div>

              {/* Content - the input widget */}
              <div className="flex-1 min-w-0">
                {item.children}
              </div>

              {/* Remove button */}
              {item.hasRemove && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "shrink-0 h-8 w-8",
                    "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
                  )}
                  onClick={item.onDropIndexClick(index)}
                >
                  <Trash01 size={16} />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add button */}
      {canAdd && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddClick}
          className="w-full max-w-md"
        >
          <Plus size={16} className="mr-2" />
          Add {itemLabel}
        </Button>
      )}
    </div>
  );
}
