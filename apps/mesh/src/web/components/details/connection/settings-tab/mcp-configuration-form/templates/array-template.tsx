/**
 * Array Field Template with Drag and Drop
 *
 * Renders array fields with sortable drag-and-drop functionality.
 * Uses @dnd-kit for smooth dragging experience.
 */

import { useState } from "react";
import type { ArrayFieldTemplateProps } from "@rjsf/utils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@deco/ui/components/button.tsx";
import { Plus, Trash01, DotsGrid } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import { formatTitle } from "../utils";

interface SortableItemProps {
  id: string;
  children: React.ReactNode;
  onRemove?: () => void;
  canRemove?: boolean;
}

function SortableItem({ id, children, onRemove, canRemove }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex gap-2 items-start p-2 rounded-md border border-transparent",
        "hover:border-border hover:bg-muted/30 transition-all",
        isDragging && "opacity-50 border-primary bg-muted shadow-lg z-50"
      )}
    >
      {/* Drag handle - always visible */}
      <button
        type="button"
        className={cn(
          "shrink-0 mt-1 cursor-grab active:cursor-grabbing",
          "text-muted-foreground hover:text-foreground transition-colors"
        )}
        {...attributes}
        {...listeners}
      >
        <DotsGrid size={16} />
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">{children}</div>

      {/* Remove button */}
      {canRemove && onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "shrink-0 h-8 w-8",
            "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
            "opacity-0 group-hover:opacity-100 transition-opacity"
          )}
          onClick={onRemove}
        >
          <Trash01 size={16} />
        </Button>
      )}
    </div>
  );
}

export function CustomArrayFieldTemplate(props: ArrayFieldTemplateProps) {
  const { items, canAdd, onAddClick, title, formData } = props;

  // Get item label for better UX
  const itemLabel = title ? formatTitle(title).replace(/s$/, "") : "Item";

  // Generate stable IDs for items
  const [itemIds] = useState(() =>
    items.map((_, index) => `item-${index}-${Date.now()}`)
  );

  // Update IDs when items change
  const currentIds = items.map((_, index) => {
    if (itemIds[index]) return itemIds[index];
    return `item-${index}-${Date.now()}`;
  });

  // Sensors for drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end - reorder items
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = currentIds.indexOf(active.id as string);
      const newIndex = currentIds.indexOf(over.id as string);

      if (oldIndex !== -1 && newIndex !== -1 && items[oldIndex]?.onReorderClick) {
        // Call RJSF's reorder handler
        items[oldIndex].onReorderClick(oldIndex, newIndex)({
          preventDefault: () => {},
          currentTarget: { blur: () => {} },
        } as unknown as React.MouseEvent);
      }
    }
  };

  return (
    <div className="space-y-2">
      {/* Array items with drag context */}
      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-md">
          No items added yet
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={currentIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1">
              {items.map((item, index) => (
                <SortableItem
                  key={currentIds[index]}
                  id={currentIds[index]}
                  canRemove={item.hasRemove}
                  onRemove={() => item.onDropIndexClick(index)()}
                >
                  {item.children}
                </SortableItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
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
