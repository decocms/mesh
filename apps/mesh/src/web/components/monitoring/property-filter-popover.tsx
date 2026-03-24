/**
 * Property Filter Popover
 *
 * Reusable component for filtering monitoring data by custom metadata properties.
 * Supports raw text mode and structured form mode with multiple operators.
 * Extracted from the monitoring page's FiltersPopover for reuse in dashboards.
 */

import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import { Textarea } from "@deco/ui/components/textarea.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { useState, useRef } from "react";
import {
  FilterLines,
  XClose,
  Plus,
  Trash01,
  Grid01,
  Code01,
} from "@untitledui/icons";
import type { PropertyFilter, PropertyFilterOperator } from "./types";
import { propertyFiltersToRaw, parseRawPropertyFilters } from "./types";

const OPERATOR_OPTIONS: Array<{
  value: PropertyFilterOperator;
  label: string;
}> = [
  { value: "eq", label: "equals" },
  { value: "contains", label: "contains" },
  { value: "in", label: "in (list)" },
  { value: "exists", label: "exists" },
];

export interface PropertyFilterPopoverProps {
  value: PropertyFilter[];
  onChange: (filters: PropertyFilter[]) => void;
}

export function PropertyFilterPopover({
  value,
  onChange,
}: PropertyFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"raw" | "form">("raw");

  const [localFilters, setLocalFilters] = useState<PropertyFilter[]>(value);
  const [localRaw, setLocalRaw] = useState(propertyFiltersToRaw(value));

  // Track previous prop value to sync when parent changes
  const prevValueRef = useRef(value);
  if (prevValueRef.current !== value) {
    prevValueRef.current = value;
    setLocalFilters(value);
    setLocalRaw(propertyFiltersToRaw(value));
  }

  const applyFormFilters = () => {
    onChange(localFilters.filter((f) => f.key.trim()));
  };

  const applyRawFilters = () => {
    const parsed = parseRawPropertyFilters(localRaw);
    setLocalFilters(parsed);
    onChange(parsed);
  };

  const toggleMode = () => {
    if (mode === "raw") {
      const parsed = parseRawPropertyFilters(localRaw);
      setLocalFilters(parsed);
      setMode("form");
    } else {
      setLocalRaw(propertyFiltersToRaw(localFilters));
      setMode("raw");
    }
  };

  const updateFilter = (index: number, updates: Partial<PropertyFilter>) => {
    const next = [...localFilters];
    const existing = next[index];
    if (!existing) return;
    next[index] = {
      key: updates.key ?? existing.key,
      operator: updates.operator ?? existing.operator,
      value: updates.value ?? existing.value,
    };
    setLocalFilters(next);
  };

  const addFilter = () => {
    setLocalFilters([...localFilters, { key: "", operator: "eq", value: "" }]);
  };

  const removeFilter = (index: number) => {
    const next = localFilters.filter((_, i) => i !== index);
    setLocalFilters(next);
    setLocalRaw(propertyFiltersToRaw(next));
    onChange(next.filter((f) => f.key.trim()));
  };

  const clearAll = () => {
    setLocalFilters([]);
    setLocalRaw("");
    onChange([]);
    setOpen(false);
  };

  const activeCount = value.filter((f) => f.key.trim()).length;

  return (
    <div className="flex items-center gap-1.5">
      {/* Active filter badges */}
      {value
        .filter((f) => f.key.trim())
        .map((f, i) => {
          const label =
            f.operator === "exists"
              ? `${f.key}?`
              : f.operator === "contains"
                ? `${f.key}~${f.value}`
                : f.operator === "in"
                  ? `${f.key}@${f.value}`
                  : `${f.key}=${f.value}`;

          return (
            <Badge
              key={`${f.key}-${i}`}
              variant="secondary"
              className="gap-1 pl-2 pr-1 h-7 text-xs font-mono font-normal cursor-default"
            >
              {label}
              <button
                type="button"
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                onClick={() => {
                  const next = value.filter((_, idx) => idx !== i);
                  onChange(next);
                }}
              >
                <XClose size={12} />
              </button>
            </Badge>
          );
        })}

      {/* Popover trigger */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 px-2 gap-1.5">
            <FilterLines className="h-3.5 w-3.5 text-muted-foreground" />
            {activeCount === 0 ? (
              <span className="text-sm">Filter</span>
            ) : (
              <span className="text-sm">{activeCount}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[380px] p-4" align="end" sideOffset={4}>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium">Property Filters</h4>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={toggleMode}
                >
                  {mode === "raw" ? <Grid01 size={14} /> : <Code01 size={14} />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {mode === "raw" ? "Switch to form view" : "Switch to raw text"}
              </TooltipContent>
            </Tooltip>
          </div>

          {mode === "raw" ? (
            <div className="space-y-1.5">
              <Textarea
                placeholder={`Paste property filters here:\nthread_id=abc123\nuser~test\ndebug?`}
                value={localRaw}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setLocalRaw(e.target.value)
                }
                onBlur={applyRawFilters}
                onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                  if (e.key === "Enter" && e.metaKey) {
                    applyRawFilters();
                  }
                }}
                className="font-mono text-sm min-h-[80px] resize-none"
              />
              <p className="text-xs text-muted-foreground">
                One per line:{" "}
                <code className="bg-muted px-1 rounded">key=value</code>{" "}
                <code className="bg-muted px-1 rounded">key~contains</code>{" "}
                <code className="bg-muted px-1 rounded">key@in_list</code>{" "}
                <code className="bg-muted px-1 rounded">key?</code>
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {localFilters.map((filter, index) => (
                <div
                  key={index}
                  className="p-2.5 rounded-md border border-border bg-muted/30 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Filter {index + 1}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => removeFilter(index)}
                    >
                      <Trash01 size={12} />
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Key (e.g., thread_id)"
                      value={filter.key}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        updateFilter(index, { key: e.target.value })
                      }
                      onBlur={applyFormFilters}
                      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === "Enter") applyFormFilters();
                      }}
                      className="flex-1 font-mono text-sm"
                    />
                    <Select
                      value={filter.operator}
                      onValueChange={(v: PropertyFilterOperator) => {
                        const next = [...localFilters];
                        const existing = next[index];
                        if (existing) {
                          next[index] = {
                            ...existing,
                            operator: v,
                            value: v === "exists" ? "" : existing.value,
                          };
                          setLocalFilters(next);
                          onChange(next.filter((f) => f.key.trim()));
                        }
                      }}
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPERATOR_OPTIONS.map((op) => (
                          <SelectItem key={op.value} value={op.value}>
                            {op.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {filter.operator !== "exists" && (
                    <Input
                      placeholder="Value"
                      value={filter.value}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        updateFilter(index, { value: e.target.value })
                      }
                      onBlur={applyFormFilters}
                      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === "Enter") applyFormFilters();
                      }}
                      className="w-full font-mono text-sm"
                    />
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={addFilter}
              >
                <Plus size={14} className="mr-1.5" />
                Add filter
              </Button>
            </div>
          )}

          {activeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-3 text-muted-foreground"
              onClick={clearAll}
            >
              Clear all filters
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
