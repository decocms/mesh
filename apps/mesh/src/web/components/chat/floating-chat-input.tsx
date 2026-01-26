/**
 * Floating Chat Input
 *
 * A minimal chat input that floats at the bottom of the screen.
 * When the user submits a message, it opens the chat panel and passes the message.
 * Hidden on home route (which has its own chat) and when chat panel is already open.
 */

import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { useDecoChatOpen } from "@/web/hooks/use-deco-chat-open";
import { useModelConnections } from "@/web/hooks/collections/use-llm";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { useVirtualMCPs } from "@decocms/mesh-sdk";
import { ArrowUp, ChevronDown, CpuChip02, X } from "@untitledui/icons";
import { Suspense, useRef, useState } from "react";
import type { Metadata } from "./types.ts";
import {
  VirtualMCPPopoverContent,
  type VirtualMCPInfo,
} from "./select-virtual-mcp";
import {
  ModelSelectorContent,
  ModelSelectorContentFallback,
  useModels,
  type ModelChangePayload,
  type SelectedModelState,
} from "./select-model";

export const FLOATING_CHAT_MESSAGE_KEY = "mesh:floating-chat:pending-message";

export interface PendingFloatingMessage {
  doc: Metadata["tiptapDoc"];
  virtualMcpId?: string | null;
  model?: SelectedModelState | null;
}

/**
 * Get the pending message from localStorage and clear it
 */
export function consumePendingFloatingMessage(): PendingFloatingMessage | null {
  try {
    const stored = localStorage.getItem(FLOATING_CHAT_MESSAGE_KEY);
    if (stored) {
      localStorage.removeItem(FLOATING_CHAT_MESSAGE_KEY);
      return JSON.parse(stored) as PendingFloatingMessage;
    }
  } catch {
    // Ignore parsing errors
  }
  return null;
}

interface FloatingChatInputProps {
  className?: string;
}

// ============================================================================
// Compact Agent Selector for Floating Input
// ============================================================================

interface CompactAgentSelectorProps {
  selectedVirtualMcpId: string | null;
  onVirtualMcpChange: (id: string | null) => void;
  virtualMcps: VirtualMCPInfo[];
}

function CompactAgentSelector({
  selectedVirtualMcpId,
  onVirtualMcpChange,
  virtualMcps,
}: CompactAgentSelectorProps) {
  const [open, setOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedVirtualMcp = selectedVirtualMcpId
    ? virtualMcps.find((g) => g.id === selectedVirtualMcpId)
    : null;

  const handleVirtualMcpChange = (id: string) => {
    onVirtualMcpChange(id);
    setOpen(false);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onVirtualMcpChange(null);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <div className="flex items-center shrink-0">
                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-1 p-1 rounded-md transition-colors",
                    "cursor-pointer hover:bg-accent",
                  )}
                >
                  {selectedVirtualMcp ? (
                    <IntegrationIcon
                      icon={selectedVirtualMcp.icon}
                      name={selectedVirtualMcp.title}
                      size="xs"
                      fallbackIcon={<CpuChip02 size={12} />}
                      className="size-5 rounded-md"
                    />
                  ) : (
                    <img
                      src="/favicon.svg"
                      alt="Default Agent"
                      className="size-5 rounded-md"
                    />
                  )}
                  <ChevronDown size={12} className="text-muted-foreground" />
                </button>
                {/* X button to remove selected agent */}
                {selectedVirtualMcp && (
                  <button
                    type="button"
                    onClick={handleRemove}
                    className="p-0.5 rounded-full hover:bg-accent transition-colors"
                    title="Remove agent"
                  >
                    <X size={12} className="text-muted-foreground" />
                  </button>
                )}
              </div>
            </PopoverTrigger>
          </TooltipTrigger>
          {!open && (
            <TooltipContent side="top" className="text-xs">
              {selectedVirtualMcp?.title ?? "Choose an agent"}
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
      <PopoverContent
        className="w-[550px] p-0 overflow-hidden"
        align="start"
        side="top"
        sideOffset={8}
      >
        <VirtualMCPPopoverContent
          virtualMcps={virtualMcps}
          selectedVirtualMcpId={selectedVirtualMcpId}
          onVirtualMcpChange={handleVirtualMcpChange}
          searchInputRef={searchInputRef}
        />
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// Compact Model Selector for Floating Input (icon only + chevron)
// ============================================================================

interface CompactModelSelectorProps {
  selectedModel: SelectedModelState | null;
  onModelChange: (model: ModelChangePayload) => void;
}

function CompactModelSelector({
  selectedModel,
  onModelChange,
}: CompactModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const modelsConnections = useModelConnections();
  const defaultConnectionId = modelsConnections[0]?.id;
  const connectionId = selectedModel?.connectionId ?? defaultConnectionId;
  const models = useModels(connectionId ?? null);

  // Find selected model to show its logo
  const currentModel = selectedModel
    ? models.find((m) => m.id === selectedModel.id)
    : models[0];

  // If no models available, don't render
  if (modelsConnections.length === 0) {
    return null;
  }

  // Build effective selectedModel for the content - default to first connection if none
  const effectiveSelectedModel: SelectedModelState | undefined = selectedModel
    ? selectedModel
    : defaultConnectionId
      ? { id: "", connectionId: defaultConnectionId }
      : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex items-center gap-1 p-1 rounded-md transition-colors",
                  "cursor-pointer hover:bg-accent",
                )}
              >
                {currentModel?.logo ? (
                  <img
                    src={currentModel.logo}
                    alt={currentModel.title}
                    className="size-5 rounded-sm"
                  />
                ) : (
                  <div className="size-5 rounded-sm bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    ?
                  </div>
                )}
                <ChevronDown size={12} className="text-muted-foreground" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          {!open && (
            <TooltipContent side="top" className="text-xs">
              {currentModel?.title ?? "Select model"}
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
      <PopoverContent
        className="w-full md:w-auto p-0"
        align="end"
        side="top"
        sideOffset={8}
      >
        <Suspense fallback={<ModelSelectorContentFallback />}>
          <ModelSelectorContent
            selectedModel={effectiveSelectedModel}
            onModelChange={onModelChange}
            onClose={() => setOpen(false)}
            modelsConnections={modelsConnections}
          />
        </Suspense>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// FloatingChatInput Component
// ============================================================================

export function FloatingChatInput({ className }: FloatingChatInputProps) {
  const [chatOpen, setChatOpen] = useDecoChatOpen();
  const [inputValue, setInputValue] = useState("");
  const [selectedVirtualMcpId, setSelectedVirtualMcpId] = useState<
    string | null
  >(null);
  const [selectedModel, setSelectedModel] = useState<SelectedModelState | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const virtualMcps = useVirtualMCPs();

  // Don't show if chat is already open
  if (chatOpen) {
    return null;
  }

  const handleModelChange = (model: ModelChangePayload) => {
    setSelectedModel({
      id: model.id,
      connectionId: model.connectionId,
    });
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmedValue = inputValue.trim();

    if (!trimmedValue) {
      // Just open the chat panel if no message
      setChatOpen(true);
      return;
    }

    // Create a tiptap doc structure for the message
    const tiptapDoc: Metadata["tiptapDoc"] = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: trimmedValue }],
        },
      ],
    };

    // Store the pending message with optional agent and model
    const pendingMessage: PendingFloatingMessage = {
      doc: tiptapDoc,
      virtualMcpId: selectedVirtualMcpId,
      model: selectedModel,
    };
    localStorage.setItem(
      FLOATING_CHAT_MESSAGE_KEY,
      JSON.stringify(pendingMessage),
    );

    // Clear input and open chat
    setInputValue("");
    setSelectedVirtualMcpId(null);
    setSelectedModel(null);
    setChatOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSubmit = inputValue.trim().length > 0;

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
        "w-full max-w-xl px-4",
        "animate-in slide-in-from-bottom-4 fade-in duration-300",
        className,
      )}
    >
      <form
        onSubmit={handleSubmit}
        className={cn(
          "flex items-center justify-between gap-2.5 p-2.5 pl-1.5",
          "bg-background border border-border rounded-full",
          "shadow-[0px_1px_1px_0px_rgba(0,0,0,0.04),0px_6px_24px_0px_rgba(0,0,0,0.01),0px_9px_48px_0px_rgba(0,0,0,0.09)]",
          "transition-all duration-200",
          "hover:border-muted-foreground/30",
        )}
      >
        {/* Left side: Agent selector + Input */}
        <div className="flex flex-1 items-center gap-1 pl-1 min-w-0">
          {/* Agent selector with X to remove */}
          <CompactAgentSelector
            selectedVirtualMcpId={selectedVirtualMcpId}
            onVirtualMcpChange={setSelectedVirtualMcpId}
            virtualMcps={virtualMcps}
          />

          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything or @ for context"
            className={cn(
              "flex-1 bg-transparent border-none outline-none min-w-0",
              "text-sm text-foreground placeholder:text-muted-foreground/50",
            )}
          />
        </div>

        {/* Right side: Model selector + Submit button */}
        <div className="flex items-center gap-1 shrink-0">
          <CompactModelSelector
            selectedModel={selectedModel}
            onModelChange={handleModelChange}
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            className={cn(
              "size-7 rounded-full transition-all",
              canSubmit
                ? "bg-foreground text-background hover:bg-foreground/90"
                : "bg-muted text-muted-foreground hover:bg-muted hover:text-muted-foreground",
            )}
            title="Send message (Enter)"
          >
            <ArrowUp size={16} />
          </Button>
        </div>
      </form>
    </div>
  );
}
