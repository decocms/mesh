/**
 * Array Field Template
 *
 * Renders array fields with add/remove/reorder controls.
 * Uses RJSF's built-in reorder functionality.
 */

import type { ArrayFieldTemplateProps } from "@rjsf/utils";
import { Button } from "@deco/ui/components/button.tsx";
import { Plus, Trash01, ChevronUp, ChevronDown } from "@untitledui/icons";
import { formatTitle } from "../utils";

export function CustomArrayFieldTemplate(props: ArrayFieldTemplateProps) {
  const { items, canAdd, onAddClick, title } = props;

  // Get item label for better UX
  const itemLabel = title ? formatTitle(title).replace(/s$/, "") : "Item";

  return (
    <div className="space-y-2">
      {/* Array items */}
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground py-3 text-center border border-dashed rounded-md">
            No items added yet
          </div>
        ) : (
          items.map((item, index) => {
            // Access item properties via type assertion
            const itemProps = item as unknown as {
              key?: string;
              index?: number;
              children: React.ReactNode;
              hasRemove?: boolean;
              hasMoveUp?: boolean;
              hasMoveDown?: boolean;
              onDropIndexClick?: (index: number) => () => void;
              onReorderClick?: (index: number, newIndex: number) => () => void;
            };

            return (
              <div
                key={itemProps.key ?? index}
                className="flex gap-2 items-start group border border-border/50 rounded-md p-2 hover:border-border transition-colors"
              >
                {/* Reorder buttons */}
                <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {itemProps.hasMoveUp && itemProps.onReorderClick && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={itemProps.onReorderClick(index, index - 1)}
                      title="Move up"
                    >
                      <ChevronUp size={14} />
                    </Button>
                  )}
                  {itemProps.hasMoveDown && itemProps.onReorderClick && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={itemProps.onReorderClick(index, index + 1)}
                      title="Move down"
                    >
                      <ChevronDown size={14} />
                    </Button>
                  )}
                </div>

                {/* Item content */}
                <div className="flex-1 min-w-0">{itemProps.children}</div>

                {/* Remove button */}
                {itemProps.hasRemove && itemProps.onDropIndexClick && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                    onClick={itemProps.onDropIndexClick(index)}
                    title={`Remove ${itemLabel}`}
                  >
                    <Trash01 size={16} />
                  </Button>
                )}
              </div>
            );
          })
        )}
      </div>

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
