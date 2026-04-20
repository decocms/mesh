import { useEffect, useState } from "react";
import { SplashScreen } from "@/web/components/splash-screen";
import { KeyboardShortcutsDialog } from "@/web/components/keyboard-shortcuts-dialog";
import { isModKey } from "@/web/lib/keyboard-shortcuts";
import RequiredAuthLayout from "@/web/layouts/required-auth-layout";
import { authClient } from "@/web/lib/auth-client";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";
import {
  ProjectContextProvider,
  SELF_MCP_ALIAS_ID,
  useMCPClient,
} from "@decocms/mesh-sdk";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Outlet,
  useMatch,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { KEYS } from "../lib/query-keys";
import { useOrgSsoStatus } from "../hooks/use-org-sso";
import { SsoRequiredScreen } from "../components/sso-required-screen";

// ---------------------------------------------------------------------------
// ShellProjectProvider — fetches org settings and provides project context.
// SSO enforcement MUST stay in ShellLayoutContent, above all child rendering.
// ---------------------------------------------------------------------------

type OrgSettingsPayload = {
  organizationId: string;
  enabled_plugins?: string[] | null;
};

/**
 * Single ProjectContextProvider for the entire shell.
 * Fetches org settings (enabledPlugins) and provides a complete project context.
 * Agent routes override this via VirtualMCPProvider.
 */
function ShellProjectProvider({
  org,
  children,
}: {
  org: NonNullable<Parameters<typeof ProjectContextProvider>[0]["org"]>;
  children: React.ReactNode;
}) {
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

  const project = {
    id: org.id,
    organizationId: org.id,
    slug: "_org",
    name: org.name,
    enabledPlugins: orgSettings?.enabled_plugins ?? null,
    ui: null,
  };

  return (
    <ProjectContextProvider org={org} project={project}>
      {children}
    </ProjectContextProvider>
  );
}

// ---------------------------------------------------------------------------
// Panel actions — works anywhere in the router tree.
// Only updates URL search params. The UnifiedPanelGroup useEffect syncs
// the visual panel layout from the querystring-derived state.
// ---------------------------------------------------------------------------

export function usePanelActions() {
  const navigate = useNavigate();

  const params = useParams({ strict: false }) as {
    org?: string;
    taskId?: string;
  };
  const orgSlug = params.org ?? "";
  const currentTaskId = params.taskId ?? "";

  const navWith = (
    taskId: string,
    searchFn: (prev: Record<string, unknown>) => Record<string, unknown>,
    replace = true,
  ) =>
    navigate({
      to: "/$org/$taskId",
      params: { org: orgSlug, taskId },
      search: searchFn,
      replace,
    });

  const nav = (
    searchFn: (prev: Record<string, unknown>) => Record<string, unknown>,
    replace = true,
  ) => navWith(currentTaskId, searchFn, replace);

  const setChatOpen = (open: boolean) =>
    nav((prev) => ({ ...prev, chat: open ? 1 : 0 }));

  const setTasksOpen = (open: boolean) =>
    nav((prev) => ({ ...prev, tasks: open ? 1 : 0 }));

  const setTaskId = (id: string, virtualMcpId?: string) =>
    navWith(
      id,
      (prev) => {
        const next: Record<string, unknown> = { chat: 1 };
        if (virtualMcpId) next.virtualmcpid = virtualMcpId;
        else if (prev.virtualmcpid) next.virtualmcpid = prev.virtualmcpid;
        if (prev.tasks) next.tasks = prev.tasks;
        return next;
      },
      false,
    );

  const createNewTask = () => setTaskId(crypto.randomUUID());

  const openTab = (tabId: string) =>
    navWith(currentTaskId || crypto.randomUUID(), (prev) => ({
      ...prev,
      main: tabId,
    }));

  const toggleMain = () =>
    nav((prev) => {
      const isOpen = prev.main !== undefined && prev.main !== "0";
      if (isOpen) {
        return { ...prev, main: "0" };
      }
      const next: Record<string, unknown> = { ...prev };
      delete next.main;
      return next;
    });

  return {
    setChatOpen,
    setTasksOpen,
    setTaskId,
    createNewTask,
    openTab,
    toggleMain,
  };
}

// ---------------------------------------------------------------------------
// ShellLayoutContent — auth, org activation, SSO enforcement, keyboard shortcuts.
// Child routes (agent or settings) render their own sidebar + inset layout.
// ---------------------------------------------------------------------------

function ShellLayoutContent() {
  const orgMatch = useMatch({ from: "/shell/$org", shouldThrow: false });
  const org = orgMatch?.params.org;
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect — subscribes to document keydown for ⌘K shortcuts dialog; DOM event listener has no React 19 alternative
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (isModKey(e) && e.code === "KeyK") {
        e.preventDefault();
        setShortcutsDialogOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const { data: activeOrg } = useSuspenseQuery({
    queryKey: KEYS.activeOrganization(org),
    queryFn: async () => {
      if (!org) {
        return null;
      }

      const { data } = await authClient.organization.setActive({
        organizationSlug: org,
      });

      // Persist for fast redirect on next login (read by homeRoute beforeLoad)
      // Only write on success to avoid caching an invalid slug
      if (data) {
        localStorage.setItem(LOCALSTORAGE_KEYS.lastOrgSlug(), org);
      }

      return data;
    },
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // Check org-level SSO enforcement (must be before early returns to satisfy Rules of Hooks)
  const orgId = activeOrg?.id;
  const { data: ssoStatus } = useOrgSsoStatus(orgId);

  if (!activeOrg) {
    return <SplashScreen />;
  }

  if (ssoStatus?.ssoRequired && !ssoStatus.authenticated) {
    return (
      <SsoRequiredScreen
        orgId={activeOrg.id}
        orgName={activeOrg.name}
        domain={ssoStatus.domain}
      />
    );
  }

  return (
    <ShellProjectProvider org={{ ...activeOrg, logo: activeOrg.logo ?? null }}>
      <Outlet />

      {/* Keyboard Shortcuts Dialog */}
      <KeyboardShortcutsDialog
        open={shortcutsDialogOpen}
        onOpenChange={setShortcutsDialogOpen}
      />
    </ShellProjectProvider>
  );
}

export default function ShellLayout() {
  return (
    <RequiredAuthLayout>
      <ShellLayoutContent />
    </RequiredAuthLayout>
  );
}
