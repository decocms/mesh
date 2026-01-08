/* eslint-disable ban-memoization/ban-memoization */
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import {
  ResponsiveSelect,
  ResponsiveSelectContent,
  ResponsiveSelectTrigger,
  ResponsiveSelectValue,
} from "@deco/ui/components/responsive-select.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { memo, useState, useRef, useEffect, type ReactNode } from "react";
import {
  Stars01,
  Image01,
  File06,
  SearchMd,
  Check,
  Grid01,
  CurrencyDollar,
  LogOut04,
  InfoCircle,
} from "@untitledui/icons";
import { useConnections } from "../../hooks/collections/use-connection";
import { useLLMsFromConnection } from "../../hooks/collections/use-llm";
import { useBindingConnections } from "../../hooks/use-binding";

export interface ModelInfo {
  id: string;
  name: string;
  logo?: string | null;
  description?: string | null;
  capabilities?: string[];
  contextWindow?: number | null;
  inputCost?: number | null;
  outputCost?: number | null;
  outputLimit?: number | null;
  provider?: string | null;
  limits?: {
    contextWindow: number;
    maxOutputTokens: number;
  } | null;
}

/**
 * Extended model info that includes connection information
 */
export interface ModelInfoWithConnection extends ModelInfo {
  connectionId: string;
  connectionName: string;
}

/**
 * Hook to fetch and map LLM models from connected model providers.
 * Returns models with connection information attached.
 */
export function useModels(): ModelInfoWithConnection[] {
  const allConnections = useConnections();
  const [modelsConnection] = useBindingConnections({
    connections: allConnections,
    binding: "LLMS",
  });
  const modelsData = useLLMsFromConnection(modelsConnection?.id, { 
    pageSize: 999,
  });

  if (!modelsData || !modelsConnection) {
    return [];
  }

  return modelsData
    .map((m) => ({
      ...m,
      name: m.title,
      contextWindow: m.limits?.contextWindow,
      outputLimit: m.limits?.maxOutputTokens,
      inputCost: m.costs?.input,
      outputCost: m.costs?.output,
      provider: m.provider,
      connectionId: modelsConnection.id,
      connectionName: modelsConnection.title,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const CAPABILITY_CONFIGS: Record<
  string,
  { icon: ReactNode; bg: string; text: string; label: string }
> = {
  reasoning: {
    icon: <Stars01 className="size-4" />,
    bg: "bg-purple-100",
    text: "text-purple-700",
    label: "Reasoning",
  },
  "image-upload": {
    icon: <Image01 className="size-4" />,
    bg: "bg-teal-100",
    text: "text-teal-700",
    label: "Can analyze images",
  },
  "file-upload": {
    icon: <File06 className="size-4" />,
    bg: "bg-blue-100",
    text: "text-blue-700",
    label: "Can analyze files",
  },
  "web-search": {
    icon: <SearchMd className="size-4" />,
    bg: "bg-amber-100",
    text: "text-amber-700",
    label: "Can search the web to answer questions",
  },
};

const CapabilityBadge = memo(function CapabilityBadge({
  capability,
}: {
  capability: string;
}) {
  const config = (() => {
    const knownConfig = CAPABILITY_CONFIGS[capability];
    return (
      knownConfig || {
        icon: <Check className="size-4" />,
        bg: "bg-slate-200",
        text: "text-slate-700",
        label: capability,
      }
    );
  })();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`flex items-center justify-center h-6 w-6 rounded-sm ${config.bg} ${config.text}`}
        >
          {config.icon}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{config.label}</p>
      </TooltipContent>
    </Tooltip>
  );
});

const ModelDetailsPanel = memo(function ModelDetailsPanel({
  model,
  compact = false,
}: {
  model: ModelInfo | null;
  compact?: boolean;
}) {
  if (!model) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Hover to preview
      </div>
    );
  }

  // Check if model has extended info (contextWindow, costs, etc)
  const hasDetails =
    model.contextWindow ||
    model.inputCost ||
    model.outputCost ||
    model.outputLimit;

  if (!hasDetails && !compact) {
    return (
      <div className="flex flex-col gap-3 py-1 px-1.5">
        <div className="flex items-center gap-3 py-2 px-0">
          {model.logo && (
            <img src={model.logo} className="w-6 h-6" alt={model.name} />
          )}
          <p className="text-lg font-medium leading-7">{model.name}</p>
        </div>
        {model.description && (
          <p className="text-sm text-muted-foreground">{model.description}</p>
        )}
      </div>
    );
  }

  if (!hasDetails && compact) {
    return null;
  }

  // Compact mobile version - just the details without header
  if (compact) {
    return (
      <div className="flex flex-col gap-2.5 pt-3 pb-3 px-3 rounded-b-lg text-xs">
        {model.contextWindow && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Context</span>
            <span className="text-foreground font-medium">
              {model.contextWindow.toLocaleString()} tokens
            </span>
          </div>
        )}

        {model.inputCost && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Input cost</span>
            <span className="text-foreground font-medium">
              ${model.inputCost.toFixed(2)} / 1M
            </span>
          </div>
        )}

        {model.outputCost && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Output cost</span>
            <span className="text-foreground font-medium">
              ${model.outputCost.toFixed(2)} / 1M
            </span>
          </div>
        )}

        {model.outputLimit && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Output limit</span>
            <span className="text-foreground font-medium">
              {model.outputLimit.toLocaleString()} tokens
            </span>
          </div>
        )}
      </div>
    );
  }

  // Full desktop version with header
  return (
    <div className="flex flex-col gap-3 py-1 px-1.5">
      <div className="flex flex-col gap-3 py-2 px-0">
        <div className="flex items-center gap-3">
          {model.logo && (
            <img src={model.logo} className="w-6 h-6" alt={model.name} />
          )}
          <p className="text-lg font-medium leading-7">{model.name}</p>
        </div>
        {model.capabilities && model.capabilities.length > 0 && (
          <div className="flex items-center gap-2">
            {model.capabilities.map((capability) => (
              <CapabilityBadge key={capability} capability={capability} />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {model.contextWindow && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <Grid01 className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-sm text-foreground">Context window</p>
            </div>
            <p className="text-sm text-muted-foreground">
              {model.contextWindow.toLocaleString()} tokens
            </p>
          </div>
        )}

        {(model.inputCost || model.outputCost) && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <CurrencyDollar className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-sm text-foreground">Costs</p>
            </div>
            <div className="flex flex-col gap-0.5">
              {model.inputCost !== null && model.inputCost !== undefined && (
                <p className="text-sm text-muted-foreground">
                  ${model.inputCost.toFixed(2)} / 1M tokens (input)
                </p>
              )}
              {model.outputCost !== null && model.outputCost !== undefined && (
                <p className="text-sm text-muted-foreground">
                  ${model.outputCost.toFixed(2)} / 1M tokens (output)
                </p>
              )}
            </div>
          </div>
        )}

        {model.outputLimit && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <LogOut04 className="w-4.5 h-4.5 text-muted-foreground/70" />
              <p className="text-sm text-foreground">Output limit</p>
            </div>
            <p className="text-sm text-muted-foreground">
              {model.outputLimit.toLocaleString()} token limit
            </p>
          </div>
        )}
      </div>
    </div>
  );
});

const ModelItemContent = memo(function ModelItemContent({
  model,
  onHover,
  isSelected,
  hasExpandedInfo,
}: {
  model: ModelInfo;
  onHover: (model: ModelInfo) => void;
  isSelected?: boolean;
  hasExpandedInfo?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 h-10 py-4 px-3 hover:bg-accent cursor-pointer",
        hasExpandedInfo ? "rounded-t-lg" : "rounded-lg",
      )}
      onMouseEnter={() => onHover(model)}
    >
      {model.logo && (
        <img src={model.logo} className="w-5 h-5 shrink-0" alt={model.name} />
      )}
      <span className="text-sm text-foreground">{model.name}</span>
      {hasExpandedInfo &&
        model.capabilities &&
        model.capabilities.length > 0 && (
          <div className="md:hidden flex items-center gap-1.5 ml-auto">
            {model.capabilities.map((capability) => (
              <CapabilityBadge key={capability} capability={capability} />
            ))}
          </div>
        )}
      {isSelected && !hasExpandedInfo && (
        <Check className="w-4 h-4 text-foreground ml-auto" />
      )}
      {isSelected && hasExpandedInfo && (
        <Check className="w-4 h-4 text-foreground ml-2 shrink-0" />
      )}
    </div>
  );
});

function SelectedModelDisplay({ model }: { model: ModelInfo | undefined }) {
  if (!model) {
    return <span className="text-sm text-muted-foreground">Select model</span>;
  }

  return (
    <div className="flex items-center gap-2 min-w-0 max-w-full">
      {model.logo && (
        <img
          src={model.logo}
          className="w-5 h-5 shrink-0 rounded-sm"
          alt={model.name}
        />
      )}
      <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors truncate min-w-0 max-w-[200px] hidden sm:inline-block">
        {model.name}
      </span>
    </div>
  );
}

/**
 * Selected model state shape for controlled components
 */
export interface SelectedModelState {
  id: string;
  connectionId: string;
}

/**
 * Model change callback payload
 */
export interface ModelChangePayload {
  id: string;
  connectionId: string;
  provider?: string;
}

export interface ModelSelectorProps {
  selectedModel?: SelectedModelState;
  onModelChange: (model: ModelChangePayload) => void;
  variant?: "borderless" | "bordered";
  className?: string;
  placeholder?: string;
}

/**
 * Rich model selector with detailed info panel, capabilities badges, and responsive UI.
 * Fetches models internally from the connected LLM provider.
 */
export function ModelSelector({
  selectedModel,
  onModelChange,
  variant = "borderless",
  className,
  placeholder = "Select model",
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [hoveredModel, setHoveredModel] = useState<ModelInfo | null>(null);
  const [showInfoMobile, setShowInfoMobile] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch models from hook
  const models = useModels();

  // Focus search input when dialog opens
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (open) {
      // Small delay to ensure the dialog is fully rendered
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
    }
  }, [open]);

  // Find selected model by matching both id and connectionId
  const selectedModelId = selectedModel
    ? models.find(
        (m) =>
          m.id === selectedModel.id &&
          m.connectionId === selectedModel.connectionId,
      )?.id
    : undefined;

  const currentModel = models.find((m) => m.id === selectedModelId);

  // Filter models based on search term
  const filteredModels = (() => {
    if (!searchTerm.trim()) return models;

    const search = searchTerm.toLowerCase();
    return models.filter((model) => {
      return (
        model.name.toLowerCase().includes(search) ||
        model.provider?.toLowerCase().includes(search) ||
        model.description?.toLowerCase().includes(search)
      );
    });
  })();

  const handleModelChange = (modelId: string) => {
    const selected = models.find((m) => m.id === modelId);
    if (!selected) return;
    onModelChange({
      id: selected.id,
      connectionId: selected.connectionId,
      provider: selected.provider ?? undefined,
    });
    setSearchTerm("");
    setOpen(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setSearchTerm("");
    }
  };

  if (models.length === 0) {
    return null;
  }

  return (
    <ResponsiveSelect
      open={open}
      onOpenChange={handleOpenChange}
      value={selectedModelId || ""}
      onValueChange={handleModelChange}
    >
      <ResponsiveSelectTrigger
        size="sm"
        className={cn(
          "text-sm hover:bg-accent rounded-lg py-0.5 px-1 gap-1 shadow-none cursor-pointer border-0 group focus-visible:ring-0 focus-visible:ring-offset-0 min-w-0 max-w-full",
          variant === "borderless" && "md:border-none",
          className,
        )}
      >
        <ResponsiveSelectValue
          placeholder={placeholder}
          className="min-w-0 max-w-full"
        >
          <SelectedModelDisplay model={currentModel} />
        </ResponsiveSelectValue>
      </ResponsiveSelectTrigger>
      <ResponsiveSelectContent
        title={placeholder}
        className="w-full md:w-auto md:min-w-[600px] [&_button[aria-label='Scroll down']]:!hidden [&_button[aria-label='Scroll up']]:!hidden"
        headerActions={
          <button
            type="button"
            onClick={() => setShowInfoMobile(!showInfoMobile)}
            className="md:hidden flex items-center justify-center h-8 w-8 rounded-lg hover:bg-accent transition-colors"
            aria-label="Toggle model info"
          >
            <InfoCircle
              className={cn(
                "w-5 h-5 transition-colors",
                showInfoMobile ? "text-foreground" : "text-muted-foreground",
              )}
            />
          </button>
        }
      >
        <div className="flex flex-col md:flex-row h-[350px]">
          {/* Left column - model list with search */}
          <div className="flex-1 flex flex-col md:border-r">
            {/* Search input */}
            <div className="border-b px-4 py-3 bg-background/95 backdrop-blur sticky top-0 z-10">
              <div className="relative">
                <SearchMd
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search for a model..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-sm border-0 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
                />
              </div>
            </div>

            {/* Model list */}
            <div className="flex-1 overflow-y-auto px-0.5">
              {filteredModels.length > 0 ? (
                filteredModels.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => handleModelChange(m.id)}
                    className={cn(
                      "rounded-lg mb-1",
                      m.id === selectedModelId && "bg-accent",
                    )}
                  >
                    <ModelItemContent
                      model={m}
                      onHover={setHoveredModel}
                      isSelected={m.id === selectedModelId}
                      hasExpandedInfo={showInfoMobile}
                    />
                    {/* Mobile info panel - shows inside model item when toggled */}
                    {showInfoMobile && (
                      <div className="md:hidden">
                        <ModelDetailsPanel model={m} compact />
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  No models found
                </div>
              )}
            </div>
          </div>

          {/* Right column - details panel (desktop only) */}
          <div className="hidden md:block md:w-[300px] p-3">
            <ModelDetailsPanel model={hoveredModel || currentModel || null} />
          </div>
        </div>
      </ResponsiveSelectContent>
    </ResponsiveSelect>
  );
}
