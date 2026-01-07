/**
 * Home Latest Items Component
 *
 * Displays a row of latest MCP servers or gateways with a plus button to add more.
 */

import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useGateways } from "@/web/hooks/collections/use-gateway";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { Container, CpuChip02, Plus } from "@untitledui/icons";
import { useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { ErrorBoundary } from "./error-boundary";

interface LatestItemProps {
  icon: string | null | undefined;
  title: string;
  onClick: () => void;
}

function LatestItem({ icon, title, onClick }: LatestItemProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className="flex items-center justify-center p-1.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
        >
          <IntegrationIcon
            icon={icon}
            name={title}
            size="sm"
            fallbackIcon={<Container size={16} />}
            className="shrink-0"
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-xs">{title}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function LatestMcpServersContent() {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const connections = useConnections({ pageSize: 5 }) ?? [];

  if (connections.length === 0) {
    return null;
  }

  // Take only the first 4 to leave room for the plus button
  const displayConnections = connections.slice(0, 4);

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground mr-1">Connections</span>
      {displayConnections.map((connection) => (
        <LatestItem
          key={connection.id}
          icon={connection.icon}
          title={connection.title}
          onClick={() =>
            navigate({
              to: "/$org/mcps/$connectionId",
              params: { org: org.slug, connectionId: connection.id },
            })
          }
        />
      ))}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg"
            onClick={() =>
              navigate({
                to: "/$org/mcps",
                params: { org: org.slug },
                search: { action: "create" },
              })
            }
          >
            <Plus size={16} className="text-muted-foreground" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">Add Connection</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function LatestGatewaysContent() {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const gateways = useGateways({ pageSize: 5 }) ?? [];

  if (gateways.length === 0) {
    return null;
  }

  // Take only the first 4 to leave room for the plus button
  const displayGateways = gateways.slice(0, 4);

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground mr-1">Gateways</span>
      {displayGateways.map((gateway) => (
        <Tooltip key={gateway.id}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() =>
                navigate({
                  to: "/$org/gateways/$gatewayId",
                  params: { org: org.slug, gatewayId: gateway.id },
                })
              }
              className="flex items-center justify-center p-1.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <IntegrationIcon
                icon={gateway.icon}
                name={gateway.title}
                size="sm"
                fallbackIcon={<CpuChip02 size={16} />}
                className="shrink-0"
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">{gateway.title}</p>
          </TooltipContent>
        </Tooltip>
      ))}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg"
            onClick={() =>
              navigate({
                to: "/$org/gateways",
                params: { org: org.slug },
                search: { action: "create" },
              })
            }
          >
            <Plus size={16} className="text-muted-foreground" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">Add Gateway</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function LatestItemsSkeleton() {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="size-8 rounded-lg bg-muted animate-pulse shrink-0"
        />
      ))}
    </div>
  );
}

export function LatestMcpServers() {
  return (
    <ErrorBoundary fallback={null}>
      <Suspense fallback={<LatestItemsSkeleton />}>
        <LatestMcpServersContent />
      </Suspense>
    </ErrorBoundary>
  );
}

export function LatestGateways() {
  return (
    <ErrorBoundary fallback={null}>
      <Suspense fallback={<LatestItemsSkeleton />}>
        <LatestGatewaysContent />
      </Suspense>
    </ErrorBoundary>
  );
}

export function HomeLatestItems() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-6 mt-6">
      <LatestMcpServers />
      <LatestGateways />
    </div>
  );
}
