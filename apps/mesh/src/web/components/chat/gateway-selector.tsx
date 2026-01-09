import type { GatewayEntity } from "@/tools/gateway/schema";
import { Check, SearchMd, CpuChip02 } from "@untitledui/icons";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import {
  ResponsiveSelect,
  ResponsiveSelectContent,
  ResponsiveSelectTrigger,
  ResponsiveSelectValue,
} from "@deco/ui/components/responsive-select.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { useState, useRef, useEffect, type ReactNode } from "react";
import { useGateways as useGatewaysCollection } from "../../hooks/collections/use-gateway";

export interface GatewayInfo
  extends Pick<GatewayEntity, "id" | "title" | "description" | "icon"> {
  fallbackIcon?: ReactNode; // Icon to use when icon is not available
}

/**
 * Hook to fetch and map gateways for the selector.
 * Returns gateway info with fallback icons attached.
 */
export function useGateways(): GatewayInfo[] {
  const gatewaysData = useGatewaysCollection();

  return (gatewaysData ?? []).map((g) => ({
    id: g.id,
    title: g.title,
    description: g.description ?? null,
    icon: g.icon ?? null,
    fallbackIcon: (<CpuChip02 />) as ReactNode,
  }));
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
        "flex items-start gap-3 py-3 px-3 hover:bg-accent cursor-pointer rounded-lg",
        isSelected && "bg-accent",
      )}
    >
      {/* Icon */}
      <IntegrationIcon
        icon={gateway.icon}
        name={gateway.title}
        size="sm"
        fallbackIcon={gateway.fallbackIcon ?? <CpuChip02 />}
        className="size-10"
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

function SelectedGatewayDisplay({
  gateway,
}: {
  gateway: GatewayInfo | undefined;
}) {
  if (!gateway) {
    return <span className="text-sm text-muted-foreground">Select agent</span>;
  }

  return (
    <div className="flex items-center gap-2 min-w-0 max-w-full">
      <IntegrationIcon
        icon={gateway.icon}
        name={gateway.title}
        size="xs"
        fallbackIcon={gateway.fallbackIcon ?? <CpuChip02 />}
        className="w-5! h-5! min-w-5! shrink-0 rounded-sm"
      />
      <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors truncate min-w-0 max-w-[200px] hidden sm:inline-block">
        {gateway.title}
      </span>
    </div>
  );
}

export interface GatewaySelectorProps {
  selectedGatewayId?: string;
  onGatewayChange: (gatewayId: string) => void;
  variant?: "borderless" | "bordered";
  className?: string;
  placeholder?: string;
}

/**
 * Rich gateway selector with avatar, name, and description.
 * Fetches gateways internally from the connected gateway providers.
 */
export function GatewaySelector({
  selectedGatewayId,
  onGatewayChange,
  variant = "bordered",
  className,
  placeholder = "Select Agent",
}: GatewaySelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch gateways from hook
  const gateways = useGateways();

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

  const selectedGateway = gateways.find((g) => g.id === selectedGatewayId);

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

  const handleGatewayChange = (gatewayId: string) => {
    onGatewayChange(gatewayId);
    setSearchTerm("");
    setOpen(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setSearchTerm("");
    }
  };

  return (
    <ResponsiveSelect
      open={open}
      onOpenChange={handleOpenChange}
      value={selectedGatewayId || ""}
      onValueChange={handleGatewayChange}
    >
      <ResponsiveSelectTrigger
        size="sm"
        className={cn(
          "text-sm hover:bg-accent rounded-lg py-0.5 px-1 gap-1 shadow-none cursor-pointer group focus-visible:ring-0 focus-visible:ring-offset-0 min-w-0 max-w-full",
          variant === "borderless" && "border-0 md:border-none",
          className,
        )}
      >
        <ResponsiveSelectValue
          placeholder={placeholder}
          className="min-w-0 max-w-full"
        >
          <SelectedGatewayDisplay gateway={selectedGateway} />
        </ResponsiveSelectValue>
      </ResponsiveSelectTrigger>
      <ResponsiveSelectContent
        title={placeholder}
        className="w-full md:w-[400px] p-0"
        side="bottom"
      >
        <div className="flex flex-col max-h-[300px]">
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
                placeholder="Search for an agent..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-sm border-0 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
              />
            </div>
          </div>

          <div className="overflow-y-auto p-2 flex flex-col gap-1">
            {filteredGateways.length > 0 ? (
              filteredGateways.map((gateway) => (
                <div
                  key={gateway.id}
                  onClick={() => handleGatewayChange(gateway.id)}
                  className="outline-none"
                >
                  <GatewayItemContent
                    gateway={gateway}
                    isSelected={gateway.id === selectedGatewayId}
                  />
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                No agents found
              </div>
            )}
          </div>
        </div>
      </ResponsiveSelectContent>
    </ResponsiveSelect>
  );
}
