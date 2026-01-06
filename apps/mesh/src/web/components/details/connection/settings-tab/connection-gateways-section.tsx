import {
  useGatewayActions,
  useGateways,
  type GatewayEntity,
} from "@/web/hooks/collections/use-gateway";
import { Button } from "@deco/ui/components/button.tsx";
import { CpuChip02, ChevronRight, Plus, Loading01 } from "@untitledui/icons";
import { Link, useNavigate } from "@tanstack/react-router";

interface ConnectionGatewaysSectionProps {
  connectionId: string;
  connectionTitle: string;
  connectionDescription?: string | null;
  connectionIcon?: string | null;
  org: string;
}

function GatewayListItem({
  gateway,
  org,
}: {
  gateway: GatewayEntity;
  org: string;
}) {
  return (
    <Link
      to="/$org/toolbox/$toolboxId"
      params={{ org, toolboxId: gateway.id }}
      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
    >
      {gateway.icon ? (
        <img
          src={gateway.icon}
          alt={gateway.title}
          className="w-8 h-8 rounded-md object-cover shrink-0"
        />
      ) : (
        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <CpuChip02 size={16} className="text-primary" />
        </div>
      )}
      <span className="flex-1 text-sm font-medium text-foreground truncate">
        {gateway.title}
      </span>
      <ChevronRight
        size={16}
        className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0"
      />
    </Link>
  );
}

function CreateGatewayButton({
  connectionId,
  connectionTitle,
  connectionDescription,
  connectionIcon,
  org,
  hasExistingGateways,
}: {
  connectionId: string;
  connectionTitle: string;
  connectionDescription?: string | null;
  connectionIcon?: string | null;
  org: string;
  hasExistingGateways: boolean;
}) {
  const navigate = useNavigate();
  const actions = useGatewayActions();

  const handleCreateGateway = async () => {
    const result = await actions.create.mutateAsync({
      title: `${connectionTitle} Gateway`,
      description: connectionDescription ?? null,
      icon: connectionIcon ?? null,
      status: "active",
      tool_selection_strategy: "passthrough",
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
      to: "/$org/toolbox/$toolboxId",
      params: { org, toolboxId: result.id },
    });
  };

  if (hasExistingGateways) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={handleCreateGateway}
        disabled={actions.create.isPending}
      >
        {actions.create.isPending ? (
          <Loading01 size={16} className="animate-spin" />
        ) : (
          <Plus size={16} />
        )}
        Create another gateway
      </Button>
    );
  }

  return (
    <Button
      size="lg"
      className="gap-2 w-full"
      onClick={handleCreateGateway}
      disabled={actions.create.isPending}
    >
      {actions.create.isPending ? (
        <Loading01 size={20} className="animate-spin" />
      ) : (
        <CpuChip02 size={20} />
      )}
      Expose via Toolbox
    </Button>
  );
}

export function ConnectionGatewaysSection({
  connectionId,
  connectionTitle,
  connectionDescription,
  connectionIcon,
  org,
}: ConnectionGatewaysSectionProps) {
  // Fetch gateways filtered by this connection
  const gateways = useGateways({
    filters: [{ column: "connection_id", value: connectionId }],
  });

  const hasGateways = gateways.length > 0;

  if (!hasGateways) {
    // No gateways - show the "Use in your IDE" section
    return (
      <div className="p-5 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-medium text-foreground">
            Use in your IDE
          </h4>
          <p className="text-xs text-muted-foreground">
            Expose this connection via a gateway to use it in Cursor, VS Code,
            Claude Desktop, and other MCP-compatible tools.
          </p>
        </div>
        <CreateGatewayButton
          connectionId={connectionId}
          connectionTitle={connectionTitle}
          connectionDescription={connectionDescription}
          connectionIcon={connectionIcon}
          org={org}
          hasExistingGateways={false}
        />
      </div>
    );
  }

  // Has gateways - show the list
  return (
    <div className="p-5 flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-medium text-foreground">Gateways</h4>
        <p className="text-xs text-muted-foreground">
          This connection is exposed via the following gateways.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {gateways.map((gateway) => (
          <GatewayListItem key={gateway.id} gateway={gateway} org={org} />
        ))}
      </div>
      <CreateGatewayButton
        connectionId={connectionId}
        connectionTitle={connectionTitle}
        connectionDescription={connectionDescription}
        connectionIcon={connectionIcon}
        org={org}
        hasExistingGateways={true}
      />
    </div>
  );
}
