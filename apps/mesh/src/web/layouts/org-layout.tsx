/**
 * Org Layout
 *
 * Wraps all org-level routes. Provides a synthetic project context
 * for backward compatibility with components that rely on useProjectContext().
 *
 * The synthetic project has isOrgAdmin = true and uses the org's ID as the project ID.
 */

import { Outlet } from "@tanstack/react-router";
import { Suspense, useEffect } from "react";
import { SplashScreen } from "@/web/components/splash-screen";
import { useChatStable } from "@/web/components/chat/context";
import {
  getWellKnownDecopilotVirtualMCP,
  ProjectContextProvider,
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { useSuspenseQuery } from "@tanstack/react-query";
import { KEYS } from "@/web/lib/query-keys";

type OrgSettingsPayload = {
  organizationId: string;
  enabled_plugins?: string[] | null;
};

/**
 * Inner component that provides a synthetic org-admin project context.
 * Must be rendered inside shell-layout's ProjectContextProvider to access org data.
 */
function OrgLayoutContent() {
  const { org } = useProjectContext();
  const { setVirtualMcpId } = useChatStable();
  // Set decopilot as the active virtual MCP for org-level routes
  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    const decopilotId = getWellKnownDecopilotVirtualMCP(org.id).id;
    setVirtualMcpId(decopilotId);
    return () => setVirtualMcpId(null);
  }, [org.id]);

  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const { data: orgSettings } = useSuspenseQuery({
    queryKey: KEYS.organizationSettings(org.id),
    queryFn: async () => {
      const result = await client.callTool({
        name: "ORGANIZATION_SETTINGS_GET",
        arguments: {},
      });
      const payload =
        (result as { structuredContent?: unknown }).structuredContent ?? result;
      return (payload ?? {}) as OrgSettingsPayload;
    },
    staleTime: 60_000,
  });

  // Build a synthetic project context for org-level views.
  // This keeps all existing components that call useProjectContext() working.
  const syntheticProject = {
    id: org.id,
    organizationId: org.id,
    slug: "_org",
    name: org.name,
    isOrgAdmin: true,
    enabledPlugins: orgSettings?.enabled_plugins ?? null,
    ui: null,
  };

  return (
    <ProjectContextProvider org={org} project={syntheticProject}>
      <Suspense fallback={<SplashScreen />}>
        <Outlet />
      </Suspense>
    </ProjectContextProvider>
  );
}

export default function OrgLayout() {
  return (
    <Suspense fallback={<SplashScreen />}>
      <OrgLayoutContent />
    </Suspense>
  );
}
