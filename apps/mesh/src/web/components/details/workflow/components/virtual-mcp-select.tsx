import { useVirtualMCPs } from "@/web/components/chat/select-virtual-mcp";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import { cn } from "@deco/ui/lib/utils.ts";

interface VirtualMCPSelectProps {
  selectedVirtualMcpId: string | null | undefined;
  onVirtualMcpChange: (virtualMcpId: string | undefined) => void;
  className?: string;
  placeholder?: string;
}

/**
 * Shadcn-based select dropdown for virtual MCP (agent) selection.
 * Used in places like workflow editor where a compact select is preferred.
 */
export function VirtualMCPSelect({
  selectedVirtualMcpId,
  onVirtualMcpChange,
  className,
  placeholder = "Select Agent",
}: VirtualMCPSelectProps) {
  const virtualMcps = useVirtualMCPs();

  return (
    <Select
      value={selectedVirtualMcpId ?? undefined}
      onValueChange={(value) =>
        onVirtualMcpChange(value === "" ? undefined : value)
      }
    >
      <SelectTrigger size="sm" className={cn("text-xs", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {virtualMcps.map((virtualMcp) => (
          <SelectItem key={virtualMcp.id} value={virtualMcp.id}>
            {virtualMcp.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
