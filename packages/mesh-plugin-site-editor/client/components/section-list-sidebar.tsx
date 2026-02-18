/**
 * Section List Sidebar Component
 *
 * Displays all block instances on a page in a sortable drag-and-drop list.
 * Each row shows the block name with a drag handle, selection highlight,
 * and delete button. Uses @dnd-kit for accessible DnD reordering.
 *
 * Augmented with pending-changes support:
 * - sectionStatuses prop adds colored badges (new/edited/deleted)
 * - Deleted sections render as greyed-out ghost rows with an Undelete button
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
import type { SectionStatus } from "../lib/use-pending-changes";

interface SectionListSidebarProps {
  blocks: BlockInstance[];
  selectedBlockId: string | null;
  onSelect: (blockId: string) => void;
  onDelete: (blockId: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onAddClick: () => void;
  /** Per-section diff status from usePendingChanges */
  sectionStatuses?: SectionStatus[];
  /** Called when user clicks Undelete on a deleted ghost row */
  onUndelete?: (block: BlockInstance) => void;
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
  status?: "new" | "edited";
}

function SortableSectionItem({
  block,
  isSelected,
  onSelect,
  onDelete,
  status,
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

      {/* Diff badge */}
      {status && (
        <span
          className={cn(
            "shrink-0 text-[10px] font-medium px-1 py-0.5 rounded",
            status === "new" && "bg-green-100 text-green-700",
            status === "edited" && "bg-yellow-100 text-yellow-700",
          )}
        >
          {status === "new" ? "new" : "edited"}
        </span>
      )}

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

interface DeletedSectionGhostRowProps {
  block: BlockInstance;
  onUndelete: () => void;
}

function DeletedSectionGhostRow({
  block,
  onUndelete,
}: DeletedSectionGhostRowProps) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded text-sm opacity-40 italic">
      <span className="shrink-0 w-5" /> {/* spacer for drag handle alignment */}
      <span className="flex-1 truncate text-muted-foreground">
        {blockLabel(block.blockType)}
      </span>
      <span className="shrink-0 text-[10px] font-medium px-1 py-0.5 rounded bg-red-100 text-red-700">
        deleted
      </span>
      <button
        type="button"
        className="shrink-0 text-xs text-blue-600 hover:text-blue-800 transition-colors whitespace-nowrap"
        onClick={(e) => {
          e.stopPropagation();
          onUndelete();
        }}
        title="Restore this section"
      >
        Undelete
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
  sectionStatuses,
  onUndelete,
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

  // Build lookup map for section statuses
  const statusMap = new Map(
    (sectionStatuses ?? []).map((s) => [s.sectionId, s]),
  );

  const deletedStatuses = (sectionStatuses ?? []).filter(
    (s) => s.status === "deleted" && s.committedBlock,
  );

  if (blocks.length === 0 && deletedStatuses.length === 0) {
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
                status={
                  statusMap.get(block.id)?.status === "deleted"
                    ? undefined
                    : (statusMap.get(block.id)?.status as
                        | "new"
                        | "edited"
                        | undefined)
                }
              />
            ))}
          </SortableContext>
        </DndContext>

        {/* Deleted section ghost rows */}
        {deletedStatuses.length > 0 && onUndelete && (
          <div className="border-t border-dashed border-border/50 mt-1 pt-1">
            {deletedStatuses.map((s) => (
              <DeletedSectionGhostRow
                key={s.sectionId}
                block={s.committedBlock!}
                onUndelete={() => onUndelete(s.committedBlock!)}
              />
            ))}
          </div>
        )}
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
