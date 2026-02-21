import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Plus } from "lucide-react";
import { Button } from "@deco/ui/components/button.tsx";
import type { BlockInstance } from "../lib/page-api";

interface SectionListSidebarProps {
  blocks: BlockInstance[];
  selectedBlockId: string | null;
  onSelectBlock: (id: string) => void;
  onReorder: (blocks: BlockInstance[]) => void;
  onRemove: (id: string) => void;
  onAddSection: () => void;
}

function SortableSection({
  block,
  isSelected,
  onSelect,
  onRemove,
}: {
  block: BlockInstance;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1 px-2 py-1.5 group cursor-pointer rounded-sm mx-1 ${
        isSelected ? "bg-accent" : "hover:bg-accent/50"
      }`}
      onClick={onSelect}
    >
      <button
        className="opacity-0 group-hover:opacity-100 cursor-grab touch-none p-0.5"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={12} className="text-muted-foreground" />
      </button>
      <span className="flex-1 text-sm truncate">{block.blockType}</span>
      <Button
        variant="ghost"
        size="icon"
        className="opacity-0 group-hover:opacity-100 h-5 w-5"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <Trash2 size={10} />
      </Button>
    </div>
  );
}

export function SectionListSidebar({
  blocks,
  selectedBlockId,
  onSelectBlock,
  onReorder,
  onRemove,
  onAddSection,
}: SectionListSidebarProps) {
  const sensors = useSensors(useSensor(PointerSensor));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex((b) => b.id === active.id);
    const newIndex = blocks.findIndex((b) => b.id === over.id);
    onReorder(arrayMove(blocks, oldIndex, newIndex));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Sections
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onAddSection}
        >
          <Plus size={12} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-4 text-center">
            <p className="text-xs text-muted-foreground">No sections yet</p>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={onAddSection}
            >
              <Plus size={10} className="mr-1" />
              Add section
            </Button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={blocks.map((b) => b.id)}
              strategy={verticalListSortingStrategy}
            >
              {blocks.map((block) => (
                <SortableSection
                  key={block.id}
                  block={block}
                  isSelected={selectedBlockId === block.id}
                  onSelect={() => onSelectBlock(block.id)}
                  onRemove={() => onRemove(block.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
