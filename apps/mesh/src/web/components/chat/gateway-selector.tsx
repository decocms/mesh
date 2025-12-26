import type { GatewayEntity } from "@/tools/gateway/schema";
import { Check, SearchMd, CpuChip02 } from "@untitledui/icons";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import {
  ResponsiveSelect,
  ResponsiveSelectContent,
  ResponsiveSelectTrigger,
  ResponsiveSelectValue,
} from "@deco/ui/components/responsive-select.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { useState, type ReactNode } from "react";

export interface GatewayInfo
  extends Pick<GatewayEntity, "id" | "title" | "description" | "icon"> {
  fallbackIcon?: ReactNode; // Icon to use when icon is not available
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
        "flex items-start gap-3 py-3 px-3 hover:bg-accent cursor-pointer rounded-xl",
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
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
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
    return (
      <span className="text-sm text-muted-foreground">Select gateway</span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <IntegrationIcon
        icon={gateway.icon}
        name={gateway.title}
        size="xs"
        fallbackIcon={gateway.fallbackIcon ?? <CpuChip02 />}
        className="size-5"
      />
      <span className="text-sm font-medium text-foreground truncate">
        {gateway.title}
      </span>
    </div>
  );
}

export interface GatewaySelectorProps {
  gateways: GatewayInfo[];
  selectedGatewayId?: string;
  onGatewayChange: (gatewayId: string) => void;
  variant?: "borderless" | "bordered";
  className?: string;
  placeholder?: string;
}

/**
 * Rich gateway selector with avatar, name, and description
 */
export function GatewaySelector({
  gateways,
  selectedGatewayId,
  onGatewayChange,
  variant = "bordered",
  className,
  placeholder = "Select gateway",
}: GatewaySelectorProps) {
  const [open, setOpen] = useState(false);
  const selectedGateway = gateways.find((g) => g.id === selectedGatewayId);

  const handleGatewayChange = (gatewayId: string) => {
    onGatewayChange(gatewayId);
    setOpen(false);
  };

  if (gateways.length === 0) {
    return null;
  }

  return (
    <ResponsiveSelect
      open={open}
      onOpenChange={setOpen}
      value={selectedGatewayId || ""}
      onValueChange={handleGatewayChange}
    >
      <ResponsiveSelectTrigger
        className={cn(
          "h-8! text-sm hover:bg-accent rounded-lg py-1 px-2 gap-1 shadow-none cursor-pointer group focus-visible:ring-0 focus-visible:ring-offset-0",
          variant === "borderless" ? "border-0 md:border-none" : "border",
          className,
        )}
      >
        <ResponsiveSelectValue placeholder={placeholder}>
          <SelectedGatewayDisplay gateway={selectedGateway} />
        </ResponsiveSelectValue>
      </ResponsiveSelectTrigger>
      <ResponsiveSelectContent
        title={placeholder}
        className="w-full md:w-[400px] p-0"
      >
        <div className="flex flex-col max-h-[400px]">
          {/* Search/Header area could go here if needed */}
          <div className="border-b px-4 py-3 bg-background/95 backdrop-blur sticky top-0 z-10">
            <div className="flex items-center gap-2 text-muted-foreground">
              <SearchMd size={16} />
              <span className="text-sm">Search for a gateway...</span>
            </div>
          </div>

          <div className="overflow-y-auto p-2 flex flex-col gap-1">
            {gateways.map((gateway) => (
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
            ))}
          </div>
        </div>
      </ResponsiveSelectContent>
    </ResponsiveSelect>
  );
}
