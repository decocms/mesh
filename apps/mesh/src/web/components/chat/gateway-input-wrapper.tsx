import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { getGatewayColor } from "@/web/utils/gateway-color";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { ChevronDown, CpuChip02, Edit01, XCircle } from "@untitledui/icons";
import { useNavigate } from "@tanstack/react-router";
import {
  useRef,
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  GatewayPopoverContent,
  useGateways,
  type GatewayInfo,
} from "./gateway-selector";

// ============================================================================
// GatewayBadge - Internal component for displaying selected gateway
// ============================================================================

interface GatewayBadgeProps {
  gateway: GatewayInfo | undefined;
  onGatewayChange: (gatewayId: string | null) => void;
  onReset: () => void;
  className?: string;
  disabled?: boolean;
}

/**
 * Badge component that displays the selected gateway in the chat input header.
 * Shows gateway icon, title, chevron, and X button to reset to default.
 * Clicking the badge opens a popover for gateway selection.
 * Only renders for non-default gateways (when a specific gateway is selected).
 */
function GatewayBadge({
  gateway,
  onGatewayChange,
  onReset,
  className,
  disabled = false,
}: GatewayBadgeProps) {
  const [open, setOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const gateways = useGateways();
  const navigate = useNavigate();
  const { org } = useProjectContext();

  // Focus search input when popover opens
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
    }
  }, [open]);

  // Don't render for default gateway or if no gateway
  if (!gateway?.id) {
    return null;
  }

  const color = getGatewayColor(gateway.id);

  const handleReset = (e: MouseEvent) => {
    e.stopPropagation();
    onReset();
  };

  const handleEdit = (e: MouseEvent) => {
    e.stopPropagation();
    navigate({
      to: "/$org/gateways/$gatewayId",
      params: { org: org.slug, gatewayId: gateway.id },
    });
  };

  const handleGatewayChange = (gatewayId: string) => {
    onGatewayChange(gatewayId);
    setOpen(false);
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between px-3 py-1.5 rounded-t-xl",
        color?.bg,
        className,
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
            selectedGatewayId={gateway.id}
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

/**
 * Helper to reset gateway to default (null).
 */
function resetToDefault(
  onGatewayChange: (gatewayId: string | null) => void,
): void {
  onGatewayChange(null);
}

// ============================================================================
// GatewayInputWrapper - Main wrapper component
// ============================================================================

export interface GatewayInputWrapperProps {
  /** The selected gateway info (null/undefined = default gateway) */
  gateway: GatewayInfo | undefined;
  /** Callback when gateway changes */
  onGatewayChange: (gatewayId: string | null) => void;
  /** The input component to wrap */
  children: ReactNode;
  /** Additional class name for the wrapper */
  className?: string;
  /** Whether the wrapper and its buttons are disabled */
  disabled?: boolean;
}

/**
 * Wraps an input component with gateway-specific styling.
 *
 * When no gateway is selected (or default), renders children as-is.
 * When a gateway is selected, wraps with a colored container and GatewayBadge header.
 *
 * This keeps the ChatInput component clean and unaware of gateway styling.
 */
export function GatewayInputWrapper({
  gateway,
  onGatewayChange,
  children,
  className,
  disabled = false,
}: GatewayInputWrapperProps) {
  const color = gateway ? getGatewayColor(gateway.id) : null;

  return (
    <div
      className={cn(
        "relative rounded-xl w-full flex flex-col p-0.5",
        gateway && "shadow-sm rounded-xl",
        color?.bg,
        className,
      )}
    >
      {/* Gateway Badge Header - min-height to prevent CLS */}
      <div className="min-h-[32px]">
        {gateway && (
          <GatewayBadge
            gateway={gateway}
            onGatewayChange={onGatewayChange}
            onReset={() => resetToDefault(onGatewayChange)}
            disabled={disabled}
          />
        )}
      </div>

      {/* Inner container with the input */}
      <div
        className={cn(
          "bg-background rounded-xl",
          !gateway && "shadow-sm rounded-xl",
        )}
      >
        {children}
      </div>
    </div>
  );
}
