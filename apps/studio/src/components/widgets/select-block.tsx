/**
 * SelectBlock - Widget for selecting blocks/loaders from a gallery
 * Simplified version ported from admin-cx
 */
import { useState, useRef } from "react";
import type { WidgetProps, RJSFSchema, StrictRJSFSchema, EnumOptionsType } from "@rjsf/utils";
import { Button } from "../ui/button";
import { beautifySchemaTitle, isSavedBlock, getSavedBlockIdBySchemaTitle } from "../../lib/schema-utils";
import { Search, ArrowRight, Package, Loader2, X } from "lucide-react";
import { Input } from "../ui/input";

interface BlockOption {
  label: string;
  value: number;
  schema?: RJSFSchema;
  resolveType?: string;
  category?: string;
}

interface SelectBlockProps<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema
> extends WidgetProps<T, S> {
  onChange: (value: any) => void;
}

export function SelectBlock<T = any, S extends StrictRJSFSchema = RJSFSchema>(
  props: SelectBlockProps<T, S>
) {
  const { options, onChange, value, id, label, disabled } = props;
  const { enumOptions = [] } = options as { enumOptions?: BlockOption[] };

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  const openModal = () => {
    setIsOpen(true);
    dialogRef.current?.showModal();
  };

  const closeModal = () => {
    setIsOpen(false);
    dialogRef.current?.close();
    setSearch("");
  };

  // Get current selection info
  const selectedOption = enumOptions[value as number];
  const selectedLabel = selectedOption?.label ?? "";
  const isSaved = isSavedBlock(selectedLabel);
  const displayLabel = isSaved
    ? getSavedBlockIdBySchemaTitle(selectedLabel)
    : beautifySchemaTitle(selectedLabel);

  // Filter options by search
  const filteredOptions = enumOptions.filter((opt) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      opt.label.toLowerCase().includes(searchLower) ||
      opt.resolveType?.toLowerCase().includes(searchLower)
    );
  });

  // Group by category
  const groupedOptions = filteredOptions.reduce((acc, opt) => {
    const category = opt.category || getCategory(opt.resolveType || opt.label);
    if (!acc[category]) acc[category] = [];
    acc[category].push(opt);
    return acc;
  }, {} as Record<string, BlockOption[]>);

  function getCategory(resolveType: string): string {
    if (resolveType.includes("/loaders/")) return "Loaders";
    if (resolveType.includes("/sections/")) return "Sections";
    if (resolveType.includes("/handlers/")) return "Handlers";
    if (resolveType.includes("/actions/")) return "Actions";
    if (isSavedBlock(resolveType)) return "Saved Blocks";
    return "Other";
  }

  return (
    <>
      <Button
        id={`open_${id}`}
        variant="outline"
        className="w-full justify-between"
        disabled={disabled}
        onClick={openModal}
        type="button"
      >
        <span className="flex items-center gap-2 truncate">
          {isSaved && <Package className="h-4 w-4 text-primary" />}
          <span className="truncate">{displayLabel || "Select..."}</span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0" />
      </Button>

      <dialog
        ref={dialogRef}
        className="fixed inset-0 z-50 h-[90vh] w-[90vw] max-w-4xl rounded-xl border border-border bg-background p-0 backdrop:bg-black/50"
        onClose={closeModal}
      >
        {isOpen && (
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="text-lg font-semibold">
                Select {label || "Block"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md p-1 hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Search */}
            <div className="border-b border-border p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search blocks..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>
            </div>

            {/* Block list */}
            <div className="flex-1 overflow-y-auto p-4">
              {Object.entries(groupedOptions).map(([category, opts]) => (
                <div key={category} className="mb-6">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {category}
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {opts.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          onChange(opt.value);
                          closeModal();
                        }}
                        className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted ${
                          value === opt.value
                            ? "border-primary bg-primary/10"
                            : "border-border"
                        }`}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                          {isSavedBlock(opt.label) ? (
                            <Package className="h-5 w-5 text-primary" />
                          ) : opt.resolveType?.includes("/loaders/") ? (
                            <Loader2 className="h-5 w-5" />
                          ) : (
                            <Package className="h-5 w-5" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">
                            {beautifySchemaTitle(opt.label)}
                          </div>
                          {opt.resolveType && (
                            <div className="truncate text-xs text-muted-foreground">
                              {opt.resolveType}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {filteredOptions.length === 0 && (
                <div className="flex h-32 items-center justify-center text-muted-foreground">
                  No blocks found
                </div>
              )}
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

export default SelectBlock;

