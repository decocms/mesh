/**
 * Array Field Template
 *
 * Renders array fields with add/remove controls.
 * Simple version that works with RJSF's default item rendering.
 */

import type { ArrayFieldTemplateProps } from "@rjsf/utils";
import { Button } from "@deco/ui/components/button.tsx";
import { Plus } from "@untitledui/icons";
import { formatTitle } from "../utils";

export function CustomArrayFieldTemplate(props: ArrayFieldTemplateProps) {
  const { items, canAdd, onAddClick, title } = props;

  // Get item label for better UX
  const itemLabel = title ? formatTitle(title).replace(/s$/, "") : "Item";

  return (
    <div className="space-y-2">
      {/* Array items - render directly without modification */}
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground py-3 text-center border border-dashed rounded-md">
            No items added yet
          </div>
        ) : (
          items.map((item, index) => (
            <div key={index} className="flex gap-2 items-start">
              <div className="flex-1">{item}</div>
            </div>
          ))
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
