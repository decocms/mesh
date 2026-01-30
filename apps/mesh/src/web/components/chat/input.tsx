import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { getAgentColor } from "@/web/utils/agent-color";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  getWellKnownDecopilotVirtualMCP,
  isDecopilot,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUp,
  ChevronDown,
  Edit01,
  Stop,
  Users03,
  XCircle,
} from "@untitledui/icons";
import type { FormEvent } from "react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useChat } from "./context";
import { ChatHighlight } from "./index";
import { ModeSelector } from "./select-mode";
import { ModelSelector } from "./select-model";
import {
  VirtualMCPPopoverContent,
  VirtualMCPSelector,
  type VirtualMCPInfo,
} from "./select-virtual-mcp";
import { FileUploadButton } from "./tiptap/file";
import {
  TiptapInput,
  TiptapProvider,
  type TiptapInputHandle,
} from "./tiptap/input";
import { isTiptapDocEmpty } from "./tiptap/utils";
import { UsageStats } from "./usage-stats";

// ============================================================================
// DecopilotIconButton - Icon button for Decopilot (similar to FileUploadButton)
// ============================================================================

interface DecopilotIconButtonProps {
  onVirtualMcpChange: (virtualMcpId: string | null) => void;
  virtualMcps: VirtualMCPInfo[];
  disabled?: boolean;
}

function DecopilotIconButton({
  onVirtualMcpChange,
  virtualMcps,
  disabled = false,
}: DecopilotIconButtonProps) {
  const [open, setOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { org } = useProjectContext();

  const decopilot = getWellKnownDecopilotVirtualMCP(org.id);

  // Filter out Decopilot from the list
  const filteredVirtualMcps = virtualMcps.filter(
    (virtualMcp) => !virtualMcp.id || !isDecopilot(virtualMcp.id),
  );

  // Focus search input when popover opens
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
    }
  }, [open]);

  const handleVirtualMcpChange = (virtualMcpId: string | null) => {
    onVirtualMcpChange(virtualMcpId);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 rounded-full"
              disabled={disabled}
            >
              <Users03 size={16} />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        {!open && <TooltipContent side="top">Decopilot</TooltipContent>}
      </Tooltip>
      <PopoverContent
        className="w-[550px] p-0 overflow-hidden"
        align="start"
        side="top"
        sideOffset={8}
      >
        <VirtualMCPPopoverContent
          virtualMcps={filteredVirtualMcps}
          selectedVirtualMcpId={decopilot.id}
          onVirtualMcpChange={handleVirtualMcpChange}
          searchInputRef={searchInputRef}
        />
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// VirtualMCPBadge - Internal component for displaying selected virtual MCP
// ============================================================================

interface VirtualMCPBadgeProps {
  virtualMcpId: string;
  virtualMcps: VirtualMCPInfo[];
  onVirtualMcpChange: (virtualMcpId: string | null) => void;
  disabled?: boolean;
}

function VirtualMCPBadge({
  virtualMcpId,
  virtualMcps,
  onVirtualMcpChange,
  disabled = false,
}: VirtualMCPBadgeProps) {
  const [open, setOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { org } = useProjectContext();

  const virtualMcp = virtualMcps.find((g) => g.id === virtualMcpId);
  if (!virtualMcp || isDecopilot(virtualMcpId)) return null; // Don't show badge for Decopilot

  // Focus search input when popover opens
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
    }
  }, [open]);

  const color = getAgentColor(virtualMcpId);

  const handleReset = (e: MouseEvent) => {
    e.stopPropagation();
    onVirtualMcpChange(null);
  };

  const handleEdit = (e: MouseEvent) => {
    e.stopPropagation();
    navigate({
      to: "/$org/agents/$agentId",
      params: { org: org.slug, agentId: virtualMcpId },
    });
  };

  const handleVirtualMcpChange = (newVirtualMcpId: string | null) => {
    onVirtualMcpChange(newVirtualMcpId);
    setOpen(false);
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between px-3 py-1.5 rounded-t-xl",
        color?.bg,
      )}
    >
      {/* Left side: Virtual MCP selector trigger with popover */}
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
              icon={virtualMcp.icon}
              name={virtualMcp.title}
              size="2xs"
              className="bg-background rounded-sm"
              fallbackIcon={virtualMcp.fallbackIcon ?? <Users03 size={10} />}
            />
            <span className="text-xs text-white font-normal">
              {virtualMcp.title}
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
          <VirtualMCPPopoverContent
            virtualMcps={virtualMcps}
            selectedVirtualMcpId={virtualMcpId}
            onVirtualMcpChange={handleVirtualMcpChange}
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
          aria-label="Edit agent"
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
// ChatInput - Merged component with virtual MCP wrapper, banners, and selectors
// ============================================================================

export function ChatInput() {
  const {
    activeThreadId,
    tiptapDoc,
    setTiptapDoc,
    virtualMcps,
    selectedVirtualMcp,
    setVirtualMcpId,
    modelsConnections,
    selectedModel,
    setSelectedModel,
    selectedMode,
    setSelectedMode,
    messages,
    isStreaming,
    sendMessage,
    stopStreaming,
    chatError,
    clearChatError,
    finishReason,
    clearFinishReason,
  } = useChat();

  const tiptapRef = useRef<TiptapInputHandle | null>(null);

  const canSubmit =
    !isStreaming && !!selectedModel && !isTiptapDocEmpty(tiptapDoc);

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    if (isStreaming) {
      stopStreaming();
    } else if (canSubmit && tiptapDoc) {
      void sendMessage(tiptapDoc);
    }
  };

  const handleFixInChat = () => {
    if (chatError) {
      const text = `I encountered this error: ${chatError.message}. Can you help me fix it?`;
      const doc = {
        type: "doc" as const,
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
      };
      void sendMessage(doc);
    }
  };

  const handleContinue = () => {
    const doc = {
      type: "doc" as const,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Please continue." }],
        },
      ],
    };
    void sendMessage(doc);
  };

  const color = selectedVirtualMcp
    ? getAgentColor(selectedVirtualMcp.id)
    : null;

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

      {/* Virtual MCP wrapper with badge */}
      <div
        className={cn(
          "relative rounded-xl w-full flex flex-col",
          selectedVirtualMcp && "shadow-sm",
          color?.bg,
        )}
      >
        {/* Virtual MCP Badge Header */}
        {selectedVirtualMcp?.id && !isDecopilot(selectedVirtualMcp.id) && (
          <VirtualMCPBadge
            onVirtualMcpChange={setVirtualMcpId}
            virtualMcpId={selectedVirtualMcp.id}
            virtualMcps={virtualMcps}
            disabled={isStreaming}
          />
        )}

        {/* Inner container with the input */}
        <div className="p-0.5">
          <TiptapProvider
            key={activeThreadId}
            tiptapDoc={tiptapDoc}
            setTiptapDoc={setTiptapDoc}
            selectedModel={selectedModel}
            isStreaming={isStreaming}
            onSubmit={handleSubmit}
          >
            <form
              onSubmit={handleSubmit}
              className={cn(
                "w-full relative rounded-xl min-h-[130px] flex flex-col border border-border bg-background",
                !selectedVirtualMcp && "shadow-sm",
              )}
            >
              <div className="relative flex flex-col gap-2 flex-1">
                {/* Input Area with Tiptap */}
                <TiptapInput
                  ref={tiptapRef}
                  selectedModel={selectedModel}
                  isStreaming={isStreaming}
                  selectedVirtualMcp={selectedVirtualMcp}
                />
              </div>

              {/* Bottom Actions Row */}
              <div className="flex items-center justify-between p-2.5">
                {/* Left Actions (agent selector and usage stats) */}
                <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                  {/* Always show selector button - DecopilotIconButton for Decopilot, VirtualMCPSelector for others */}
                  {selectedVirtualMcp && isDecopilot(selectedVirtualMcp.id) ? (
                    <DecopilotIconButton
                      onVirtualMcpChange={setVirtualMcpId}
                      virtualMcps={virtualMcps}
                      disabled={isStreaming}
                    />
                  ) : (
                    <VirtualMCPSelector
                      selectedVirtualMcpId={selectedVirtualMcp?.id ?? null}
                      onVirtualMcpChange={setVirtualMcpId}
                      virtualMcps={virtualMcps}
                      placeholder="Agent"
                      disabled={isStreaming}
                    />
                  )}
                  <UsageStats messages={messages} />
                </div>

                {/* Right Actions (model, mode, file upload, send button) */}
                <div className="flex items-center gap-1">
                  <ModelSelector
                    selectedModel={selectedModel ?? undefined}
                    onModelChange={setSelectedModel}
                    modelsConnections={modelsConnections}
                    placeholder="Model"
                    variant="borderless"
                  />
                  <ModeSelector
                    selectedMode={selectedMode}
                    onModeChange={setSelectedMode}
                    placeholder="Mode"
                    variant="borderless"
                    disabled={isStreaming}
                  />
                  <FileUploadButton
                    selectedModel={selectedModel}
                    isStreaming={isStreaming}
                  />
                  <Button
                    type={isStreaming ? "button" : "submit"}
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
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
          </TiptapProvider>
        </div>
      </div>
    </div>
  );
}
