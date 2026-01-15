import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { getGatewayColor } from "@/web/utils/gateway-color";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import { Textarea } from "@deco/ui/components/textarea.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUp,
  ChevronDown,
  CornerUpLeft,
  CpuChip02,
  Edit01,
  Stop,
  XCircle,
} from "@untitledui/icons";
import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useChat } from "./context";
import { ChatHighlight } from "./index";
import {
  GatewayPopoverContent,
  GatewaySelector,
  type GatewayInfo,
} from "./select-gateway";
import { ModelSelector } from "./select-model";
import { UsageStats } from "./usage-stats";

// ============================================================================
// GatewayBadge - Internal component for displaying selected gateway
// ============================================================================

interface GatewayBadgeProps {
  gatewayId: string;
  gateways: GatewayInfo[];
  onGatewayChange: (gatewayId: string | null) => void;
  disabled?: boolean;
}

function GatewayBadge({
  gatewayId,
  gateways,
  onGatewayChange,
  disabled = false,
}: GatewayBadgeProps) {
  const [open, setOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { org } = useProjectContext();

  const gateway = gateways.find((g) => g.id === gatewayId);
  if (!gateway) return null;

  // Focus search input when popover opens
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
    }
  }, [open]);

  const color = getGatewayColor(gatewayId);

  const handleReset = (e: MouseEvent) => {
    e.stopPropagation();
    onGatewayChange(null);
  };

  const handleEdit = (e: MouseEvent) => {
    e.stopPropagation();
    navigate({
      to: "/$org/gateways/$gatewayId",
      params: { org: org.slug, gatewayId },
    });
  };

  const handleGatewayChange = (newGatewayId: string) => {
    onGatewayChange(newGatewayId);
    setOpen(false);
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between px-3 py-1.5 rounded-t-xl",
        color?.bg,
      )}
    >
      {/* Left side: Gateway selector trigger with popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "flex items-center gap-1.5 hover:opacity-80 transition-opacity",
              disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
            )}
          >
            <IntegrationIcon
              icon={gateway.icon}
              name={gateway.title}
              size="2xs"
              fallbackIcon={gateway.fallbackIcon ?? <CpuChip02 size={10} />}
            />
            <span className="text-xs text-white font-normal">
              {gateway.title}
            </span>
            <ChevronDown size={14} className="text-white/50" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[550px] p-0 overflow-hidden"
          align="start"
          side="top"
          sideOffset={8}
        >
          <GatewayPopoverContent
            gateways={gateways}
            selectedGatewayId={gatewayId}
            onGatewayChange={handleGatewayChange}
            searchInputRef={searchInputRef}
          />
        </PopoverContent>
      </Popover>

      {/* Right side: Edit and Reset buttons */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleEdit}
          disabled={disabled}
          className={cn(
            "flex items-center justify-center p-1 rounded-full transition-colors",
            disabled
              ? "cursor-not-allowed opacity-50"
              : "cursor-pointer hover:bg-white/10",
          )}
          aria-label="Edit gateway"
        >
          <Edit01 size={14} className="text-white" />
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={disabled}
          className={cn(
            "flex items-center justify-center p-1 rounded-full transition-colors",
            disabled
              ? "cursor-not-allowed opacity-50"
              : "cursor-pointer hover:bg-white/10",
          )}
          aria-label="Reset to default"
        >
          <XCircle size={14} className="text-white" />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// ChatInput - Merged component with gateway wrapper, banners, and selectors
// ============================================================================

export function ChatInput() {
  const {
    inputValue,
    setInputValue,
    branchContext,
    clearBranch,
    setActiveThreadId,
    gateways,
    selectedGateway,
    setGatewayId,
    modelsConnections,
    selectedModel,
    setSelectedModel,
    messages,
    isStreaming,
    sendMessage,
    stopStreaming,
    chatError,
    clearChatError,
    finishReason,
    clearFinishReason,
  } = useChat();

  const canSubmit =
    !isStreaming && selectedModel && inputValue.trim().length > 0;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isStreaming) {
      stopStreaming();
    } else if (canSubmit) {
      sendMessage(inputValue.trim());
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) {
        sendMessage(inputValue.trim());
      }
    }
  };

  const handleGoToOriginalMessage = () => {
    if (!branchContext) return;
    setActiveThreadId(branchContext.originalThreadId);
    clearBranch();
    setInputValue("");
  };

  const handleFixInChat = () => {
    if (chatError) {
      sendMessage(
        `I encountered this error: ${chatError.message}. Can you help me fix it?`,
      );
    }
  };

  const handleContinue = () => {
    sendMessage("Please continue.");
  };

  const color = selectedGateway ? getGatewayColor(selectedGateway.id) : null;
  const placeholder = !selectedModel
    ? "Select a model to start chatting"
    : "Ask anything or @ for context";

  return (
    <div className="flex flex-col gap-2 w-full min-h-42 justify-end">
      {/* Banners above input */}
      {chatError && (
        <ChatHighlight
          variant="danger"
          title="Error occurred"
          description={chatError.message}
          icon={<AlertCircle size={16} />}
          onDismiss={clearChatError}
        >
          <Button
            size="sm"
            variant="outline"
            onClick={handleFixInChat}
            className="h-7 text-xs"
          >
            Fix in chat
          </Button>
          <Button size="sm" variant="outline" disabled className="h-7 text-xs">
            Report
          </Button>
        </ChatHighlight>
      )}

      {finishReason && finishReason !== "stop" && (
        <ChatHighlight
          variant="warning"
          title="Response incomplete"
          description={
            finishReason === "length"
              ? "Response reached the model's output limit. Different models have different limits. Try switching models or asking it to continue."
              : finishReason === "content-filter"
                ? "Response was filtered due to content policy."
                : finishReason === "tool-calls"
                  ? "Response paused after tool execution to prevent infinite loops and save costs. Click continue to keep working."
                  : `Response stopped unexpectedly: ${finishReason}`
          }
          icon={<AlertTriangle size={16} />}
          onDismiss={clearFinishReason}
        >
          <Button
            size="sm"
            variant="outline"
            onClick={handleContinue}
            className="h-7 text-xs"
          >
            Continue
          </Button>
        </ChatHighlight>
      )}

      {branchContext && (
        <ChatHighlight
          variant="default"
          title="Editing message (click to view original)"
          description={branchContext.originalMessageText}
          icon={<CornerUpLeft size={14} />}
          onDismiss={() => {
            clearBranch();
            setInputValue("");
          }}
        >
          <Button
            size="sm"
            variant="outline"
            onClick={handleGoToOriginalMessage}
            className="h-7 text-xs"
          >
            View original
          </Button>
        </ChatHighlight>
      )}

      {/* Gateway wrapper with badge */}
      <div
        className={cn(
          "relative rounded-xl w-full flex flex-col",
          selectedGateway && "shadow-sm",
          color?.bg,
        )}
      >
        {/* Gateway Badge Header */}
        {selectedGateway && (
          <GatewayBadge
            gatewayId={selectedGateway.id}
            gateways={gateways}
            onGatewayChange={setGatewayId}
            disabled={isStreaming}
          />
        )}

        {/* Inner container with the input */}
        <div className="p-0.5">
          <form
            onSubmit={handleSubmit}
            className={cn(
              "w-full relative rounded-xl min-h-[130px] flex flex-col border border-border bg-background",
              !selectedGateway && "shadow-sm",
            )}
          >
            <div className="relative flex flex-col gap-2 p-2.5 flex-1">
              {/* Input Area */}
              <div
                className="overflow-y-auto relative flex-1"
                style={{ maxHeight: "164px" }}
              >
                <Textarea
                  rows={1}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  disabled={!selectedModel || isStreaming}
                  className={cn(
                    "placeholder:text-muted-foreground resize-none focus-visible:ring-0 border-0 p-2 text-[15px]! min-h-[20px] w-full",
                    "rounded-none shadow-none",
                    "min-h-[20px] h-auto overflow-hidden",
                  )}
                />
              </div>
            </div>

            {/* Bottom Actions Row */}
            <div className="flex items-center justify-between p-2.5">
              {/* Left Actions (selectors) */}
              <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                {/* GatewaySelector only shown when default is selected (no badge) */}
                {!selectedGateway && (
                  <GatewaySelector
                    selectedGatewayId={null}
                    onGatewayChange={setGatewayId}
                    gateways={gateways}
                    placeholder="Agent"
                    disabled={isStreaming}
                  />
                )}
                <ModelSelector
                  selectedModel={selectedModel ?? undefined}
                  onModelChange={setSelectedModel}
                  modelsConnections={modelsConnections}
                  placeholder="Model"
                  variant="borderless"
                />
                <UsageStats messages={messages} />
              </div>

              {/* Right Actions (send button) */}
              <div className="flex items-center gap-1">
                <Button
                  type={isStreaming ? "button" : "submit"}
                  onClick={(e) => {
                    if (isStreaming) {
                      e.preventDefault();
                      e.stopPropagation();
                      stopStreaming();
                    }
                  }}
                  variant={canSubmit || isStreaming ? "default" : "ghost"}
                  size="icon"
                  disabled={!canSubmit && !isStreaming}
                  className={cn(
                    "size-8 rounded-full transition-all",
                    !canSubmit &&
                      !isStreaming &&
                      "bg-muted text-muted-foreground hover:bg-muted hover:text-muted-foreground cursor-not-allowed",
                  )}
                  title={
                    isStreaming ? "Stop generating" : "Send message (Enter)"
                  }
                >
                  {isStreaming ? <Stop size={20} /> : <ArrowUp size={20} />}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
