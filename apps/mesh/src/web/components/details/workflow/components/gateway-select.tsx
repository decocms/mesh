import { useGateways } from "@/web/components/chat/gateway-selector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import { cn } from "@deco/ui/lib/utils.ts";

interface GatewaySelectProps {
  selectedGatewayId: string | null | undefined;
  onGatewayChange: (gatewayId: string | undefined) => void;
  className?: string;
  placeholder?: string;
}

/**
 * Shadcn-based select dropdown for gateway selection.
 * Used in places like workflow editor where a compact select is preferred.
 */
export function GatewaySelect({
  selectedGatewayId,
  onGatewayChange,
  className,
  placeholder = "Select Agent",
}: GatewaySelectProps) {
  const gateways = useGateways();

  return (
    <Select
      value={selectedGatewayId ?? undefined}
      onValueChange={(value) =>
        onGatewayChange(value === "" ? undefined : value)
      }
    >
      <SelectTrigger size="sm" className={cn("text-xs", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {gateways.map((gateway) => (
          <SelectItem key={gateway.id} value={gateway.id}>
            {gateway.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
