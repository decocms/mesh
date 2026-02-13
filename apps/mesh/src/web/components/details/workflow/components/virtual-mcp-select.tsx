import {
  getDecopilotId,
  isDecopilot,
  useProjectContext,
  useVirtualMCPs as useVirtualMCPsCollection,
} from "@decocms/mesh-sdk";
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
 *
 * When no user-created agents exist, defaults to Decopilot which has
 * passthrough and exposes all tools available in the organization.
 */
export function VirtualMCPSelect({
  selectedVirtualMcpId,
  onVirtualMcpChange,
  className,
  placeholder = "Select Agent",
}: VirtualMCPSelectProps) {
  const virtualMcps = useVirtualMCPsCollection() ?? [];
  const { org } = useProjectContext();
  const decopilotId = getDecopilotId(org.id);

  const userAgents = virtualMcps.filter(
    (v) => v.id !== null && !isDecopilot(v.id),
  );

  return (
    <Select
      value={selectedVirtualMcpId ?? decopilotId}
      onValueChange={(value) =>
        onVirtualMcpChange(value === "" ? undefined : value)
      }
    >
      <SelectTrigger size="sm" className={cn("text-xs", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={decopilotId}>All tools (Decopilot)</SelectItem>
        {userAgents.map((virtualMcp) => (
          <SelectItem key={virtualMcp.id} value={virtualMcp.id!}>
            {virtualMcp.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
