/**
 * Site Diagnostics Recruitment Modal
 *
 * Shown when the user clicks the Site Diagnostics agent on the home page.
 * Creates a real HTTP connection + virtual MCP via the existing APIs,
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
import { useNavigate } from "@tanstack/react-router";
import {
  getSiteDiagnosticsUiMetadata,
  SELF_MCP_ALIAS_ID,
  SITE_DIAGNOSTICS_CONNECTION_DESCRIPTION,
  SITE_DIAGNOSTICS_DESCRIPTION,
  SITE_DIAGNOSTICS_ICON,
  SITE_DIAGNOSTICS_INSTRUCTIONS,
  SITE_DIAGNOSTICS_MCP_URL,
  useConnectionActions,
  useMCPClient,
  useProjectContext,
  useVirtualMCPActions,
} from "@decocms/mesh-sdk";
import type { CollectionListOutput } from "@decocms/bindings/collections";
import type { ConnectionEntity, VirtualMCPEntity } from "@decocms/mesh-sdk";

interface SiteDiagnosticsRecruitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CAPABILITIES = [
  "Full HAR capture with cache, TTFB, and request analysis",
  "Screenshot capture for visual inspection",
  "Page discovery via sitemap, navigation, and link crawling",
  "SEO audit — meta tags, structured data, robots.txt",
  "Third-party script inventory and size analysis",
  "Dead link detection across the entire site",
  "Deco-specific diagnostics (?__d debug mode)",
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
        Add a blackbox diagnostics agent that tests your storefront from the
        outside — no internal access needed. Give it a URL and it produces a
        detailed performance and health report.
      </p>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Capabilities</p>
        <ul className="space-y-1.5">
          {CAPABILITIES.map((cap) => (
            <li
              key={cap}
              className="text-sm text-muted-foreground flex items-start gap-2"
            >
              <span className="text-emerald-500 mt-0.5 shrink-0">+</span>
              {cap}
            </li>
          ))}
        </ul>
      </div>

      <Button
        onClick={onRecruit}
        disabled={isRecruiting}
        className="w-full cursor-pointer"
      >
        {isRecruiting ? "Setting up..." : "Add Site Diagnostics"}
      </Button>
    </div>
  );
}

const HEADER_ICON = (
  <IntegrationIcon
    icon={SITE_DIAGNOSTICS_ICON}
    name="Site Diagnostics"
    size="sm"
  />
);

export function SiteDiagnosticsRecruitModal({
  open,
  onOpenChange,
}: SiteDiagnosticsRecruitModalProps) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { org } = useProjectContext();
  const connectionActions = useConnectionActions();
  const virtualMcpActions = useVirtualMCPActions();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const [isRecruiting, setIsRecruiting] = useState(false);

  const handleRecruit = async () => {
    setIsRecruiting(true);
    try {
      // 1. Check if a site-diagnostics virtual MCP already exists
      const existingVirtualMcpResult = await client.callTool({
        name: "COLLECTION_VIRTUAL_MCP_LIST",
        arguments: {
          where: {
            field: ["metadata", "type"],
            operator: "eq",
            value: "site-diagnostics",
          },
          limit: 1,
          offset: 0,
        },
      });

      const existingVirtualMcps = (
        existingVirtualMcpResult as {
          structuredContent?: CollectionListOutput<VirtualMCPEntity>;
        }
      )?.structuredContent?.items;

      if (
        existingVirtualMcps &&
        existingVirtualMcps.length > 0 &&
        existingVirtualMcps[0]?.id
      ) {
        // Already exists — just navigate to it
        onOpenChange(false);
        navigate({
          to: "/$org/$virtualMcpId",
          params: {
            org: org.slug,
            virtualMcpId: existingVirtualMcps[0].id,
          },
        });
        return;
      }

      // 2. Find or create the HTTP connection to the external site-diagnostics MCP
      const existingConnectionResult = await client.callTool({
        name: "COLLECTION_CONNECTIONS_LIST",
        arguments: {
          where: {
            field: ["app_id"],
            operator: "eq",
            value: "deco/site-diagnostics",
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

      if (
        existingConnections &&
        existingConnections.length > 0 &&
        existingConnections[0]?.id
      ) {
        connectionId = existingConnections[0].id;
      } else {
        const connection = await connectionActions.create.mutateAsync({
          title: "Site Diagnostics",
          description: SITE_DIAGNOSTICS_CONNECTION_DESCRIPTION,
          icon: SITE_DIAGNOSTICS_ICON,
          connection_type: "HTTP",
          connection_url: SITE_DIAGNOSTICS_MCP_URL,
          app_name: "site-diagnostics",
          app_id: "deco/site-diagnostics",
          metadata: {
            type: "site-diagnostics",
            source: "store",
            registry_item_id: "deco/site-diagnostics",
            verified: true,
          },
        });
        connectionId = connection.id;
      }

      // 3. Create a virtual MCP (agent) with the connection attached
      const virtualMcp = await virtualMcpActions.create.mutateAsync({
        title: "Site Diagnostics",
        description: SITE_DIAGNOSTICS_DESCRIPTION,
        icon: SITE_DIAGNOSTICS_ICON,
        status: "active",
        connections: [
          {
            connection_id: connectionId,
            selected_tools: null,
            selected_resources: null,
            selected_prompts: null,
          },
        ],
        metadata: {
          type: "site-diagnostics",
          instructions: SITE_DIAGNOSTICS_INSTRUCTIONS,
          ui: getSiteDiagnosticsUiMetadata(connectionId),
        },
      });

      // 4. Navigate to the new agent
      onOpenChange(false);
      navigate({
        to: "/$org/$virtualMcpId",
        params: {
          org: org.slug,
          virtualMcpId: virtualMcp.id!,
        },
      });
    } catch (error) {
      console.error("Failed to create Site Diagnostics agent:", error);
    } finally {
      setIsRecruiting(false);
    }
  };

  const title = "Add Site Diagnostics";

  return isMobile ? (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[70dvh]">
        <DrawerHeader className="px-4 pt-4 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            {HEADER_ICON}
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
            {HEADER_ICON}
            <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
          </div>
        </DialogHeader>
        <RecruitContent onRecruit={handleRecruit} isRecruiting={isRecruiting} />
      </DialogContent>
    </Dialog>
  );
}
