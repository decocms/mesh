import type { GatewayEntity } from "@/tools/gateway/schema";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
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
import { Check, CpuChip02, SearchMd } from "@untitledui/icons";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useGateways as useGatewaysCollection } from "../../hooks/collections/use-gateway";
import { useCreateGateway } from "../../hooks/use-create-gateway";

export interface GatewayInfo
  extends Pick<GatewayEntity, "id" | "title" | "description" | "icon"> {
  fallbackIcon?: ReactNode; // Icon to use when icon is not available
}

/**
 * Hook to fetch and map gateways for the selector.
 * Returns only real gateways from the database.
 * When no gateway is selected (null), the default gateway route is used.
 */
export function useGateways(): GatewayInfo[] {
  const gatewaysData = useGatewaysCollection();
  return gatewaysData ?? [];
}

function GatewayItemContent({
  gateway,
  isSelected,
}: {
  gateway: GatewayInfo;
  isSelected?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 py-3 px-3 hover:bg-accent cursor-pointer rounded-xl transition-colors",
        isSelected && "bg-accent",
      )}
    >
      {/* Icon */}
      <IntegrationIcon
        icon={gateway.icon}
        name={gateway.title}
        size="sm"
        fallbackIcon={gateway.fallbackIcon ?? <CpuChip02 />}
        className="size-10 rounded-xl border border-stone-200/60 shadow-sm shrink-0"
      />

      {/* Text Content */}
      <div className="flex flex-col flex-1 min-w-0 gap-0.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground truncate">
            {gateway.title}
          </span>
          {isSelected && (
            <Check size={16} className="text-foreground shrink-0" />
          )}
        </div>
        {gateway.description && (
          <p className="text-xs text-muted-foreground line-clamp-1 leading-relaxed">
            {gateway.description}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------- Shared Popover Content ----------

export interface GatewayPopoverContentProps {
  gateways: GatewayInfo[];
  selectedGatewayId?: string | null;
  searchInputRef?: RefObject<HTMLInputElement | null>;
}

/**
 * Shared popover content for gateway selection.
 * Contains search input and gateway grid.
 * Used by both GatewaySelector and GatewayBadge.
 */
export function GatewayPopoverContent({
  gateways,
  selectedGatewayId,
  searchInputRef,
}: GatewayPopoverContentProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const internalRef = useRef<HTMLInputElement>(null);
  const inputRef = searchInputRef ?? internalRef;
  const { createGateway, isCreating } = useCreateGateway({
    navigateOnCreate: true,
  });
  // Filter gateways based on search term
  const filteredGateways = (() => {
    if (!searchTerm.trim()) return gateways;

    const search = searchTerm.toLowerCase();
    return gateways.filter((gateway) => {
      return (
        gateway.title.toLowerCase().includes(search) ||
        gateway.description?.toLowerCase().includes(search)
      );
    });
  })();

  return (
    <div className="flex flex-col max-h-[400px]">
      {/* Search input */}
      <div className="border-b px-4 py-3 bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="relative flex items-center gap-2">
          <SearchMd
            size={16}
            className="text-muted-foreground pointer-events-none shrink-0"
          />
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search for an agent..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 h-8 text-sm border-0 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none p-0"
          />
          <Button
            onClick={createGateway}
            variant="outline"
            size="sm"
            className="h-8 px-3 rounded-lg text-sm font-medium shrink-0"
            disabled={isCreating}
          >
            {isCreating ? "Creating..." : "Create Agent"}
          </Button>
        </div>
      </div>

      {/* Gateway grid */}
      <div className="overflow-y-auto p-1.5">
        {filteredGateways.length > 0 ? (
          <div className="grid grid-cols-2 gap-0.5">
            {filteredGateways.map((gateway) => (
              <div
                key={gateway.id}
                role="button"
                tabIndex={0}
                onClick={() => {}}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                  }
                }}
                className="outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
              >
                <GatewayItemContent
                  gateway={gateway}
                  isSelected={gateway.id === selectedGatewayId}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            No agents found
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Gateway Selector Component ----------

export interface GatewaySelectorProps {
  selectedGatewayId?: string | null;
  gateways?: GatewayInfo[];
  variant?: "borderless" | "bordered";
  className?: string;
  placeholder?: string;
  showTooltip?: boolean;
  disabled?: boolean;
}

/**
 * Gateway selector with icon button trigger and tooltip.
 * Opens a popover with searchable gateway list.
 * Used when no gateway is selected (null/default state).
 */
export function GatewaySelector({
  selectedGatewayId,
  gateways: gatewaysProp,
  variant: _variant,
  className,
  placeholder = "Select Agent",
  showTooltip = true,
  disabled = false,
}: GatewaySelectorProps) {
  const [open, setOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Use provided gateways or fetch from hook
  const gatewaysFromHook = useGateways();
  const gateways = gatewaysProp ?? gatewaysFromHook;

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

  const selectedGateway = selectedGatewayId
    ? gateways.find((g) => g.id === selectedGatewayId)
    : null;

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
  };

  const triggerButton = (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "flex items-center justify-center p-1 rounded-md transition-colors shrink-0",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "cursor-pointer hover:bg-accent",
        className,
      )}
      aria-label={placeholder}
    >
      {selectedGateway ? (
        <IntegrationIcon
          icon={selectedGateway.icon}
          name={selectedGateway.title}
          size="xs"
          fallbackIcon={selectedGateway.fallbackIcon ?? <CpuChip02 size={12} />}
          className="size-5 rounded-md"
        />
      ) : (
        <img
          src="/favicon.svg"
          alt="Default Agent"
          className="size-5 rounded-md"
        />
      )}
    </button>
  );

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : handleOpenChange}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
          </TooltipTrigger>
          {showTooltip && !open && (
            <TooltipContent side="top" className="text-xs">
              {selectedGateway?.title ?? "Choose an agent to chat with"}
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
        <GatewayPopoverContent
          gateways={gateways}
          selectedGatewayId={selectedGatewayId}
          searchInputRef={searchInputRef}
        />
      </PopoverContent>
    </Popover>
  );
}
