/**
 * Web Performance Recruitment Modal
 *
 * Shown when the user clicks the Web Performance agent on the home page.
 * Creates a local HTTP connection to the web-perf MCP server + virtual MCP,
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
  useConnectionActions,
  useMCPClient,
  useMCPToolCallMutation,
  useProjectContext,
  useVirtualMCPActions,
} from "@decocms/mesh-sdk";
import type { CollectionListOutput } from "@decocms/bindings/collections";
import type { ConnectionEntity } from "@decocms/mesh-sdk";
import { useNavigateToAgent } from "@/web/hooks/use-navigate-to-agent";

interface WebPerfRecruitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingAgent?: { id: string } | null;
}

const WEB_PERF_URL = "http://localhost:3002/mcp";

const WEB_PERF_INSTRUCTIONS = `You are a Web Performance Expert agent. You help users monitor, analyze, and improve the performance of their websites using real-world field data (Chrome UX Report) and lab data (PageSpeed Insights / Lighthouse).

## Core Web Vitals
- LCP (Largest Contentful Paint): Loading. Good < 2.5s, Poor > 4.0s
- INP (Interaction to Next Paint): Interactivity. Good < 200ms, Poor > 500ms
- CLS (Cumulative Layout Shift): Visual stability. Good < 0.1, Poor > 0.25
- FCP (First Contentful Paint): Good < 1.8s, Poor > 3.0s
- TTFB (Time to First Byte): Good < 800ms, Poor > 1.8s

## Workflow
1. When a user mentions a website, use the initial-setup prompt: SITE_ADD → PERF_SNAPSHOT → CRUX_HISTORY → PERF_REPORT.
2. Present CrUX field data as the primary indicator. PageSpeed lab data is for diagnostics.
3. Be specific: name the metric, current value, threshold, and concrete fix.
4. Prioritize Core Web Vitals first, then secondary metrics.

## Output Style
- Use concrete numbers: "LCP is 3.2s (threshold: 2.5s)" not "LCP is slow"
- Structure recommendations as actionable items for GitHub issues or dev tasks`;

const CAPABILITIES = [
  "Chrome UX Report (CrUX) real-user field data — 28-day rolling averages",
  "PageSpeed Insights lab tests with Lighthouse scores and audits",
  "Core Web Vitals monitoring: LCP, INP, CLS, FCP, TTFB",
  "25-week CrUX history for trend analysis and sparkline charts",
  "Visual dashboards with gauges, histograms, and trend charts",
  "Actionable performance reports with prioritized fix recommendations",
  "Track multiple sites with file-based snapshots over time",
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
        Add a web performance monitoring agent that uses Chrome UX Report field
        data and PageSpeed Insights lab tests to analyze, track, and improve
        your website performance.
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
        {isRecruiting ? "Setting up..." : "Add Web Performance"}
      </Button>
    </div>
  );
}

export function WebPerfRecruitModal({
  open,
  onOpenChange,
  existingAgent,
}: WebPerfRecruitModalProps) {
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

  const template = WELL_KNOWN_AGENT_TEMPLATES.find((t) => t.id === "web-perf")!;

  const headerIcon = (
    <IntegrationIcon icon={template.icon} name={template.title} size="sm" />
  );

  const handleRecruit = async () => {
    // If agent already exists, just navigate to it
    if (existingAgent) {
      onOpenChange(false);
      navigateToAgent(existingAgent.id);
      return;
    }

    setIsRecruiting(true);
    try {
      // 1. Find or create the HTTP connection to the local web-perf MCP
      const existingConnectionResult = await connectionQuery.mutateAsync({
        name: "COLLECTION_CONNECTIONS_LIST",
        arguments: {
          where: {
            field: ["connection_url"],
            operator: "eq",
            value: WEB_PERF_URL,
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
        (c) => c.connection_url === WEB_PERF_URL,
      );

      if (matchingConnection) {
        connectionId = matchingConnection.id;
      } else {
        const connection = await connectionActions.create.mutateAsync({
          title: "Web Performance",
          description:
            "Web performance monitoring with CrUX and PageSpeed Insights",
          icon: template.icon,
          connection_type: "HTTP",
          connection_url: WEB_PERF_URL,
          app_name: "web-perf",
          app_id: "deco/web-perf",
          metadata: {
            type: "web-perf",
            source: "local",
          },
        });
        connectionId = connection.id;
      }

      // 2. Create a virtual MCP (agent) with the connection attached
      const virtualMcp = await virtualMcpActions.create.mutateAsync({
        title: "Web Performance",
        description:
          "Monitor and optimize website performance with CrUX field data and PageSpeed Insights lab tests",
        icon: template.icon,
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
          type: "web-perf",
          instructions: WEB_PERF_INSTRUCTIONS,
          ui: {
            pinnedViews: [
              {
                connectionId,
                toolName: "SITE_LIST",
                label: "Dashboard",
                icon: null,
              },
            ],
            layout: {
              defaultMainView: {
                type: "ext-apps",
                id: connectionId,
                toolName: "SITE_LIST",
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
      console.error("Failed to create Web Performance agent:", error);
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
