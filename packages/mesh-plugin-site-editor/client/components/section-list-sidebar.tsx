/**
 * Section List Sidebar Component
 *
 * Displays all block instances on a page in a sortable drag-and-drop list.
 * Each row shows the block name with a drag handle, selection highlight,
 * and delete button. Uses @dnd-kit for accessible DnD reordering.
 */

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { cn } from "@deco/ui/lib/utils.ts";
import { Button } from "@deco/ui/components/button.tsx";
import type { BlockInstance } from "../lib/page-api";

interface SectionListSidebarProps {
  blocks: BlockInstance[];
  selectedBlockId: string | null;
  onSelect: (blockId: string) => void;
  onDelete: (blockId: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onAddClick: () => void;
}

/**
 * Derive a display label from a blockType ID.
 * "sections--Hero" -> "Hero"
 * "layout--Header" -> "Header"
 */
function blockLabel(blockType: string): string {
  const parts = blockType.replace(/--/g, "/").split("/");
  return parts[parts.length - 1] ?? blockType;
}

interface SortableSectionItemProps {
  block: BlockInstance;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function SortableSectionItem({
  block,
  isSelected,
  onSelect,
  onDelete,
}: SortableSectionItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1.5 rounded text-sm transition-colors group",
        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted",
        isDragging && "opacity-50 z-50",
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-0.5"
        {...listeners}
        {...attributes}
      >
        <GripVertical size={14} />
      </button>

      {/* Block label - clickable for selection */}
      <button
        type="button"
        className="flex-1 text-left truncate"
        onClick={onSelect}
      >
        {blockLabel(block.blockType)}
      </button>

      {/* Delete button - visible on hover */}
      <button
        type="button"
        className={cn(
          "shrink-0 p-0.5 text-muted-foreground hover:text-destructive transition-opacity",
          isHovered ? "opacity-100" : "opacity-0",
        )}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Remove section"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export function SectionListSidebar({
  blocks,
  selectedBlockId,
  onSelect,
  onDelete,
  onReorder,
  onAddClick,
}: SectionListSidebarProps) {
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(active.id as string, over.id as string);
    }
  };

  if (blocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <p className="text-sm text-muted-foreground mb-3">No sections yet</p>
        <Button variant="outline" size="sm" onClick={onAddClick}>
          <Plus size={14} className="mr-1" />
          Add Section
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <h3 className="text-sm font-medium text-muted-foreground px-3 py-2">
        Sections
      </h3>

      <div className="flex-1 overflow-y-auto px-1">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={blocks.map((b) => b.id)}
            strategy={verticalListSortingStrategy}
          >
            {blocks.map((block) => (
              <SortableSectionItem
                key={block.id}
                block={block}
                isSelected={selectedBlockId === block.id}
                onSelect={() => onSelect(block.id)}
                onDelete={() => onDelete(block.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {/* Add Section footer */}
      <div className="border-t border-border p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={onAddClick}
        >
          <Plus size={14} className="mr-1" />
          Add Section
        </Button>
      </div>
    </div>
  );
}
