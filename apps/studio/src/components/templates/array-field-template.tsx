import type { ArrayFieldTemplateProps, ArrayFieldTemplateItemType } from "@rjsf/utils";
import { Button } from "../ui/button";
import { Plus, Trash2, GripVertical, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function ArrayFieldTemplate(props: ArrayFieldTemplateProps) {
  const { title, items, canAdd, onAddClick, schema, required } = props;
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between p-3 bg-muted/50">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 text-left"
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span className="font-medium text-sm">
            {title || "Items"}
            {required && <span className="text-destructive ml-1">*</span>}
          </span>
          <span className="text-xs text-muted-foreground">
            ({items.length} {items.length === 1 ? "item" : "items"})
          </span>
        </button>

        {canAdd && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onAddClick}
            className="gap-1 h-7"
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        )}
      </div>

      {schema.description && (
        <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
          {schema.description}
        </div>
      )}

      <div
        className={cn(
          "overflow-hidden transition-all",
          isOpen ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="divide-y divide-border">
          {items.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No items yet. Click "Add" to create one.
            </div>
          ) : (
            items.map((item) => (
              <ArrayItem key={item.key} item={item} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ArrayItem({ item }: { item: ArrayFieldTemplateItemType }) {
  const { children, hasRemove, onDropIndexClick, index } = item;

  return (
    <div className="group flex gap-2 p-3">
      <div className="flex flex-col items-center gap-1 pt-2">
        <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-grab" />
        <span className="text-xs text-muted-foreground">{index + 1}</span>
      </div>

      <div className="flex-1 min-w-0">{children}</div>

      {hasRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDropIndexClick(index)}
          className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

