import { ChevronDown, SearchMd } from "@untitledui/icons";
import { useMemo, useState } from "react";
import { cn } from "../lib/utils.ts";
import { Button } from "./button.tsx";
import { Input } from "./input.tsx";
import { Label } from "./label.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./popover.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select.tsx";

export interface LLMConnectionOption {
  id: string;
  title: string;
  icon?: string | null;
}

export interface LLMModelOption {
  id: string;
  title: string;
  logo?: string | null;
  capabilities?: string[];
}

interface LLMModelSelectorProps {
  connectionId: string;
  modelId: string;
  connections: LLMConnectionOption[];
  models: LLMModelOption[];
  onConnectionChange: (connectionId: string) => void;
  onModelChange: (modelId: string) => void;
  connectionLabel?: string;
  modelLabel?: string;
  connectionPlaceholder?: string;
  modelPlaceholder?: string;
  className?: string;
}

export function LLMModelSelector({
  connectionId,
  modelId,
  connections,
  models,
  onConnectionChange,
  onModelChange,
  connectionLabel = "LLM Connection",
  modelLabel = "Model",
  connectionPlaceholder = "Select LLM connection",
  modelPlaceholder = "Select model",
  className,
}: LLMModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedModel = useMemo(
    () => models.find((model) => model.id === modelId),
    [models, modelId],
  );

  const filteredModels = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return models;
    return models.filter(
      (model) =>
        model.title.toLowerCase().includes(query) ||
        model.id.toLowerCase().includes(query),
    );
  }, [models, search]);
  const selectedConnection = useMemo(
    () => connections.find((connection) => connection.id === connectionId),
    [connections, connectionId],
  );

  const getCapabilityBadges = (capabilities: string[] | undefined) => {
    const set = new Set((capabilities ?? []).map((item) => item.toLowerCase()));
    const badges: string[] = [];
    if (set.has("text")) badges.push("Text");
    if (set.has("vision")) badges.push("Vision");
    if (set.has("tools")) badges.push("Tools");
    return badges;
  };

  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label>{modelLabel}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-full justify-between px-3"
            aria-label={modelLabel}
          >
            <span className="truncate text-left">
              {selectedModel?.title || modelPlaceholder}
            </span>
            <ChevronDown className="size-4 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[calc(100vw-2rem)] sm:w-[460px] lg:w-[500px] max-w-[92vw] p-0"
          align="start"
          sideOffset={8}
        >
          <div className="p-3 border-b border-border grid grid-cols-[1fr_auto] items-center gap-3">
            <div className="relative flex-1 min-w-0">
              <SearchMd className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 pl-8"
                placeholder="Search for a model..."
              />
            </div>
            <div className="w-auto shrink-0">
              <Select value={connectionId} onValueChange={onConnectionChange}>
                <SelectTrigger
                  id="llm-connection-select"
                  className="h-9 min-w-[160px] max-w-[220px]"
                  aria-label={connectionLabel}
                >
                  {selectedConnection ? (
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="size-4 rounded-sm overflow-hidden bg-muted/30 shrink-0 flex items-center justify-center">
                        {selectedConnection.icon ? (
                          <img
                            src={selectedConnection.icon}
                            alt={selectedConnection.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-[10px] font-semibold text-muted-foreground">
                            {selectedConnection.title.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span className="truncate">
                        {selectedConnection.title}
                      </span>
                    </span>
                  ) : (
                    <SelectValue placeholder={connectionPlaceholder} />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {connections.map((connection) => (
                    <SelectItem key={connection.id} value={connection.id}>
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="size-4 rounded-sm overflow-hidden bg-muted/30 shrink-0 flex items-center justify-center">
                          {connection.icon ? (
                            <img
                              src={connection.icon}
                              alt={connection.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-[10px] font-semibold text-muted-foreground">
                              {connection.title.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                        </span>
                        <span className="truncate">{connection.title}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="max-h-[55vh] sm:max-h-[420px] overflow-y-auto p-2">
            {filteredModels.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-3">
                No models found.
              </p>
            ) : (
              filteredModels.map((model) => {
                const isSelected = model.id === modelId;
                const capabilityBadges = getCapabilityBadges(
                  model.capabilities,
                );
                return (
                  <button
                    key={model.id}
                    type="button"
                    className={cn(
                      "w-full text-left px-3 py-3 rounded-lg text-sm flex items-center gap-3",
                      isSelected
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted",
                    )}
                    onClick={() => {
                      onModelChange(model.id);
                      setOpen(false);
                    }}
                  >
                    <div className="size-8 rounded-md border border-border bg-muted/40 overflow-hidden shrink-0 flex items-center justify-center">
                      {model.logo ? (
                        <img
                          src={model.logo}
                          alt={model.title}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-xs font-medium text-muted-foreground">
                          {(model.title || model.id).slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{model.title}</div>
                      {model.title !== model.id && (
                        <div className="text-xs text-muted-foreground truncate">
                          {model.id}
                        </div>
                      )}
                    </div>
                    {capabilityBadges.length > 0 && (
                      <div className="flex items-center gap-2 shrink-0">
                        {capabilityBadges.map((badge) => (
                          <span
                            key={`${model.id}-${badge}`}
                            className="text-xs font-medium px-2.5 py-1 rounded-md bg-primary/12 text-primary"
                          >
                            {badge}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
