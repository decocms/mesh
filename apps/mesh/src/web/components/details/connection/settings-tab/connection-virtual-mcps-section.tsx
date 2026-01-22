import {
  useVirtualMCPActions,
  useVirtualMCPs,
  type VirtualMCPEntity,
} from "@/web/hooks/collections/use-virtual-mcp";
import { Button } from "@deco/ui/components/button.tsx";
import { CpuChip02, ChevronRight, Plus, Loading01 } from "@untitledui/icons";
import { Link, useNavigate } from "@tanstack/react-router";

interface ConnectionVirtualMCPsSectionProps {
  connectionId: string;
  connectionTitle: string;
  connectionDescription?: string | null;
  connectionIcon?: string | null;
  org: string;
}

function VirtualMCPListItem({
  virtualMcp,
  org,
}: {
  virtualMcp: VirtualMCPEntity;
  org: string;
}) {
  return (
    <Link
      to="/$org/agents/$agentId"
      params={{ org, agentId: virtualMcp.id }}
      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
    >
      {virtualMcp.icon ? (
        <img
          src={virtualMcp.icon}
          alt={virtualMcp.title}
          className="w-8 h-8 rounded-md object-cover shrink-0"
        />
      ) : (
        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <CpuChip02 size={16} className="text-primary" />
        </div>
      )}
      <span className="flex-1 text-sm font-medium text-foreground truncate">
        {virtualMcp.title}
      </span>
      <ChevronRight
        size={16}
        className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0"
      />
    </Link>
  );
}

function CreateVirtualMCPButton({
  connectionId,
  connectionTitle,
  connectionDescription,
  connectionIcon,
  org,
  hasExistingVirtualMcps,
}: {
  connectionId: string;
  connectionTitle: string;
  connectionDescription?: string | null;
  connectionIcon?: string | null;
  org: string;
  hasExistingVirtualMcps: boolean;
}) {
  const navigate = useNavigate();
  const actions = useVirtualMCPActions();

  const handleCreateVirtualMCP = async () => {
    const result = await actions.create.mutateAsync({
      title: `${connectionTitle} Agent`,
      description: connectionDescription ?? null,
      icon: connectionIcon ?? null,
      status: "active",
      tool_selection_mode: "inclusion",
      connections: [
        {
          connection_id: connectionId,
          selected_tools: null,
          selected_resources: null,
          selected_prompts: null,
        },
      ],
    });

    navigate({
      to: "/$org/agents/$agentId",
      params: { org, agentId: result.id },
    });
  };

  if (hasExistingVirtualMcps) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={handleCreateVirtualMCP}
        disabled={actions.create.isPending}
      >
        {actions.create.isPending ? (
          <Loading01 size={16} className="animate-spin" />
        ) : (
          <Plus size={16} />
        )}
        Create another Agent
      </Button>
    );
  }

  return (
    <Button
      size="lg"
      className="gap-2 w-full"
      onClick={handleCreateVirtualMCP}
      disabled={actions.create.isPending}
    >
      {actions.create.isPending ? (
        <Loading01 size={20} className="animate-spin" />
      ) : (
        <CpuChip02 size={20} />
      )}
      Create an agent
    </Button>
  );
}

export function ConnectionVirtualMCPsSection({
  connectionId,
  connectionTitle,
  connectionDescription,
  connectionIcon,
  org,
}: ConnectionVirtualMCPsSectionProps) {
  // Fetch virtual MCPs filtered by this connection
  const virtualMcps = useVirtualMCPs({
    filters: [{ column: "connection_id", value: connectionId }],
  });

  const hasVirtualMcps = virtualMcps.length > 0;

  if (!hasVirtualMcps) {
    // No virtual MCPs - show the "Use in your IDE" section
    return (
      <div className="p-5 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-medium text-foreground">
            Use in your IDE
          </h4>
          <p className="text-xs text-muted-foreground">
            Expose this connection via an Agent to use it in Cursor, VS Code,
            Claude Desktop, and other MCP-compatible tools.
          </p>
        </div>
        <CreateVirtualMCPButton
          connectionId={connectionId}
          connectionTitle={connectionTitle}
          connectionDescription={connectionDescription}
          connectionIcon={connectionIcon}
          org={org}
          hasExistingVirtualMcps={false}
        />
      </div>
    );
  }

  // Has virtual MCPs - show the list
  return (
    <div className="p-5 flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-medium text-foreground">Agents</h4>
        <p className="text-xs text-muted-foreground">
          This connection is used on the following agents.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {virtualMcps.map((virtualMcp) => (
          <VirtualMCPListItem
            key={virtualMcp.id}
            virtualMcp={virtualMcp}
            org={org}
          />
        ))}
      </div>
      <CreateVirtualMCPButton
        connectionId={connectionId}
        connectionTitle={connectionTitle}
        connectionDescription={connectionDescription}
        connectionIcon={connectionIcon}
        org={org}
        hasExistingVirtualMcps={true}
      />
    </div>
  );
}
