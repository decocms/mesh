/**
 * Deco Flights Recruitment Modal
 *
 * Shown when the user clicks the Flights template on the home page.
 * Creates an HTTP connection to the local deco-flights MCP + virtual MCP,
 * then navigates to the agent view.
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@deco/ui/components/drawer.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { useIsMobile } from "@deco/ui/hooks/use-mobile.ts";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import {
  SELF_MCP_ALIAS_ID,
  WELL_KNOWN_AGENT_TEMPLATES,
  WellKnownOrgMCPId,
  useConnectionActions,
  useMCPClient,
  useMCPToolCallMutation,
  useProjectContext,
  useVirtualMCPActions,
} from "@decocms/mesh-sdk";
import type { CollectionListOutput } from "@decocms/bindings/collections";
import type { ConnectionEntity } from "@decocms/mesh-sdk";
import { useNavigateToAgent } from "@/web/hooks/use-navigate-to-agent";

const DECO_FLIGHTS_MCP_URL = "http://localhost:4747/mcp";

const AGENT_INSTRUCTIONS = `You are a flight research assistant powered by Deco Flights. Help users plan trips by searching for the best flights across flexible date ranges.

## Workflow
1. Ask the user where they want to go, when, how long, and any preferences
2. Use TRIP_CREATE to save the trip with all gathered details
3. Review the search plan and confirm with the user
4. Use TRIP_EXECUTE to run all searches
5. Use TRIP_GET to display the ranked results

## Tips
- Confirm destination IATA codes (e.g., LAX for Los Angeles, SFO for San Francisco)
- Ask about stops, layover limits, airline preferences, budget
- Suggest wider date ranges for more options
- Use TRIP_LIST to show all saved trips`;

interface DecoFlightsRecruitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingAgent?: { id: string } | null;
}

const CAPABILITIES = [
  "Search flights across flexible date ranges via Google Flights",
  "Save trip research plans with preferences and constraints",
  "Automated multi-search execution across date combinations",
  "Score and rank results by price, stops, layovers, and preferences",
  "Interactive trip planner UI with sortable results table",
  "Persistent local storage — come back to review results anytime",
];

function RecruitContent({
  onRecruit,
  isRecruiting,
}: {
  onRecruit: () => void;
  isRecruiting: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Add a Flights agent that helps you research and compare flights.
        Describe your trip and it searches across date ranges, scores results,
        and presents the best options.
      </p>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Capabilities</p>
        <ul className="space-y-1.5">
          {CAPABILITIES.map((cap) => (
            <li
              key={cap}
              className="text-sm text-muted-foreground flex items-start gap-2"
            >
              <span className="text-sky-500 mt-0.5 shrink-0">+</span>
              {cap}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
        <p className="text-xs text-sky-800">
          Start the flights server with{" "}
          <code className="bg-sky-100 px-1 rounded">
            bun run --cwd packages/deco-flights dev
          </code>
        </p>
      </div>

      <Button
        onClick={onRecruit}
        disabled={isRecruiting}
        className="w-full cursor-pointer"
      >
        {isRecruiting ? "Setting up..." : "Add Flights Agent"}
      </Button>
    </div>
  );
}

export function DecoFlightsRecruitModal({
  open,
  onOpenChange,
  existingAgent,
}: DecoFlightsRecruitModalProps) {
  const isMobile = useIsMobile();
  const { org } = useProjectContext();
  const navigateToAgent = useNavigateToAgent();
  const connectionActions = useConnectionActions();
  const virtualMcpActions = useVirtualMCPActions();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const connectionQuery = useMCPToolCallMutation({ client });
  const [isRecruiting, setIsRecruiting] = useState(false);

  const template = WELL_KNOWN_AGENT_TEMPLATES.find(
    (t) => t.id === "deco-flights",
  )!;

  const headerIcon = (
    <IntegrationIcon icon={template.icon} name={template.title} size="sm" />
  );

  const handleRecruit = async () => {
    if (existingAgent) {
      onOpenChange(false);
      navigateToAgent(existingAgent.id);
      return;
    }

    setIsRecruiting(true);
    try {
      // 1. Find or create the HTTP connection to the local flights MCP
      const existingConnectionResult = await connectionQuery.mutateAsync({
        name: "COLLECTION_CONNECTIONS_LIST",
        arguments: {
          where: {
            field: ["app_id"],
            operator: "eq",
            value: "deco-flights",
          },
          limit: 1,
          offset: 0,
        },
      });

      let connectionId: string;
      const existingConnections = (
        existingConnectionResult as {
          structuredContent?: CollectionListOutput<ConnectionEntity>;
        }
      )?.structuredContent?.items;

      const matchingConnection = existingConnections?.find(
        (c) => c.app_id === "deco-flights",
      );

      const selfConnectionId = WellKnownOrgMCPId.SELF(org.id);

      if (matchingConnection) {
        connectionId = matchingConnection.id;
      } else {
        const connection = await connectionActions.create.mutateAsync({
          title: template.title,
          description: "Flight research assistant powered by Google Flights",
          icon: template.icon,
          connection_type: "HTTP",
          connection_url: DECO_FLIGHTS_MCP_URL,
          app_name: "deco-flights",
          app_id: "deco-flights",
          metadata: {
            type: "deco-flights",
            source: "local",
          },
        });
        connectionId = connection.id;
      }

      // 2. Create a virtual MCP (agent) with the connection + self MCP attached
      const virtualMcp = await virtualMcpActions.create.mutateAsync({
        title: template.title,
        description: "Flight research assistant powered by Google Flights",
        icon: template.icon,
        status: "active",
        connections: [
          {
            connection_id: connectionId,
            selected_tools: null,
            selected_resources: null,
            selected_prompts: null,
          },
          {
            connection_id: selfConnectionId,
            selected_tools: null,
            selected_resources: null,
            selected_prompts: null,
          },
        ],
        metadata: {
          type: "deco-flights",
          instructions: AGENT_INSTRUCTIONS,
          ui: {
            pinnedViews: [
              {
                connectionId,
                toolName: "TRIP_LIST",
                label: "My Trips",
                icon: null,
              },
            ],
            layout: {
              defaultMainView: {
                type: "ext-apps",
                id: connectionId,
                toolName: "TRIP_LIST",
              },
              chatDefaultOpen: true,
            },
          },
        },
      });

      // 3. Navigate to the new agent
      onOpenChange(false);
      navigateToAgent(virtualMcp.id!);
    } catch (error) {
      console.error("Failed to create Flights agent:", error);
    } finally {
      setIsRecruiting(false);
    }
  };

  const title = `Add ${template.title}`;

  return isMobile ? (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[70dvh]">
        <DrawerHeader className="px-4 pt-4 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            {headerIcon}
            <DrawerTitle className="text-xl font-semibold">{title}</DrawerTitle>
          </div>
        </DrawerHeader>
        <div className="flex flex-col flex-1 min-h-0 px-4 pb-8">
          <RecruitContent
            onRecruit={handleRecruit}
            isRecruiting={isRecruiting}
          />
        </div>
      </DrawerContent>
    </Drawer>
  ) : (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] p-8">
        <DialogHeader className="mb-4">
          <div className="flex items-center gap-3">
            {headerIcon}
            <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
          </div>
        </DialogHeader>
        <RecruitContent onRecruit={handleRecruit} isRecruiting={isRecruiting} />
      </DialogContent>
    </Dialog>
  );
}
