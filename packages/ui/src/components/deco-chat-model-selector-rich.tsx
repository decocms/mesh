/* eslint-disable ban-memoization/ban-memoization */
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip.tsx";
import {
  ResponsiveSelect,
  ResponsiveSelectContent,
  ResponsiveSelectTrigger,
  ResponsiveSelectValue,
} from "./responsive-select.tsx";
import { cn } from "../lib/utils.ts";
import { memo, useMemo, useState, type ReactNode } from "react";
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
  const config = useMemo(() => {
    const knownConfig = CAPABILITY_CONFIGS[capability];
    return (
      knownConfig || {
        icon: <Check className="size-4" />,
        bg: "bg-slate-200",
        text: "text-slate-700",
        label: capability,
      }
    );
  }, [capability]);

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
      <div className="flex flex-col gap-2.5 pt-3 pb-3 px-3 rounded-b-xl text-xs">
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
        hasExpandedInfo ? "rounded-t-xl" : "rounded-xl",
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
    <div className="flex items-center gap-2">
      {model.logo && (
        <img src={model.logo} className="w-4 h-4" alt={model.name} />
      )}
      <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
        {model.name}
      </span>
    </div>
  );
}

export interface DecoChatModelSelectorRichProps {
  models: ModelInfo[];
  selectedModelId?: string;
  onModelChange: (modelId: string) => void;
  variant?: "borderless" | "bordered";
  className?: string;
  placeholder?: string;
}

/**
 * Rich model selector with detailed info panel, capabilities badges, and responsive UI
 */
export function DecoChatModelSelectorRich({
  models,
  selectedModelId,
  onModelChange,
  variant = "borderless",
  className,
  placeholder = "Select model",
}: DecoChatModelSelectorRichProps) {
  const [open, setOpen] = useState(false);
  const [hoveredModel, setHoveredModel] = useState<ModelInfo | null>(null);
  const [showInfoMobile, setShowInfoMobile] = useState(false);

  const currentModel = models.find((m) => m.id === selectedModelId);

  const handleModelChange = (modelId: string) => {
    onModelChange(modelId);
    setOpen(false);
  };

  if (models.length === 0) {
    return null;
  }

  return (
    <ResponsiveSelect
      open={open}
      onOpenChange={setOpen}
      value={selectedModelId || ""}
      onValueChange={handleModelChange}
    >
      <ResponsiveSelectTrigger
        className={cn(
          "h-8! text-sm hover:bg-accent rounded-lg py-1 px-2 gap-1 shadow-none cursor-pointer border-0 group focus-visible:ring-0 focus-visible:ring-offset-0",
          variant === "borderless" && "md:border-none",
          className,
        )}
      >
        <ResponsiveSelectValue placeholder={placeholder}>
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
          {/* Left column - model list */}
          <div className="flex-1 overflow-y-auto px-0.5 md:border-r">
            {models.map((m) => (
              <div
                key={m.id}
                onClick={() => handleModelChange(m.id)}
                className={cn(
                  "rounded-xl mb-1",
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
            ))}
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
