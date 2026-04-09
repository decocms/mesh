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
  useSearch,
} from "@tanstack/react-router";
import { KEYS } from "../lib/query-keys";
import { useOrgSsoStatus } from "../hooks/use-org-sso";
import { SsoRequiredScreen } from "../components/sso-required-screen";
import {
  computeDefaultSizes,
  usePanelGroupRef,
} from "@/web/hooks/use-layout-state";

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
// Reads panel group ref from PanelGroupRefContext (optional — null outside
// the agent tree). Derives panel state from querystring for setLayout().
// ---------------------------------------------------------------------------

type PanelActionSearchParams = {
  tasks?: number;
  mainOpen?: number;
  chat?: number;
};

function deriveOpenState(search: PanelActionSearchParams) {
  // Treat undefined as "open" (the most common default)
  return {
    tasksOpen: search.tasks !== 0,
    mainOpen: search.mainOpen !== 0,
    chatOpen: search.chat !== 0,
  };
}

function applyLayout(
  ref: ReturnType<typeof usePanelGroupRef>,
  nextState: { tasksOpen: boolean; mainOpen: boolean; chatOpen: boolean },
) {
  const handle = ref?.current;
  if (!handle) return;
  const sizes = computeDefaultSizes(nextState);
  handle.setLayout([sizes.tasks, sizes.main, sizes.chat]);
}

export function usePanelActions() {
  const navigate = useNavigate();
  const panelGroupRef = usePanelGroupRef();
  const search = useSearch({ strict: false }) as PanelActionSearchParams;

  const agentsMatch = useMatch({
    from: "/shell/$org/$virtualMcpId",
    shouldThrow: false,
  });
  const orgHomeMatch = useMatch({
    from: "/shell/$org/",
    shouldThrow: false,
  });

  const orgSlug = agentsMatch?.params.org ?? orgHomeMatch?.params.org ?? "";
  const isAgentRoute = !!agentsMatch;
  const virtualMcpId = agentsMatch?.params.virtualMcpId ?? "";

  const routeBase = isAgentRoute
    ? ("/$org/$virtualMcpId/" as const)
    : ("/$org/" as const);
  const routeParams = isAgentRoute
    ? { org: orgSlug, virtualMcpId }
    : { org: orgSlug };

  const nav = (
    searchFn: (prev: Record<string, unknown>) => Record<string, unknown>,
    replace = true,
  ) =>
    navigate({
      to: routeBase,
      params: routeParams,
      search: searchFn,
      replace,
    });

  const setChatOpen = (open: boolean) => {
    const current = deriveOpenState(search);
    const nextState = { ...current, chatOpen: open };
    applyLayout(panelGroupRef, nextState);
    nav((prev) => ({ ...prev, chat: open ? 1 : 0 }));
  };

  const setTasksOpen = (open: boolean) => {
    const current = deriveOpenState(search);
    const nextState = { ...current, tasksOpen: open };
    applyLayout(panelGroupRef, nextState);
    nav((prev) => ({ ...prev, tasks: open ? 1 : 0 }));
  };

  const setTaskId = (id: string) =>
    nav((prev) => {
      const next: Record<string, unknown> = { taskId: id, chat: 1 };
      if (prev.tasks) next.tasks = prev.tasks;
      return next;
    }, false);

  const createNewTask = () => {
    const newTaskId = crypto.randomUUID();
    nav((prev) => {
      const next: Record<string, unknown> = {
        taskId: newTaskId,
        chat: 1,
      };
      if (prev.tasks) next.tasks = prev.tasks;
      return next;
    }, false);
  };

  const openMainView = (
    view: string,
    opts?: { id?: string; toolName?: string },
  ) => {
    if (view === "default") {
      nav((prev) => {
        const next: Record<string, unknown> = {};
        if (prev.taskId) next.taskId = prev.taskId;
        if (prev.tasks) next.tasks = prev.tasks;
        if (prev.mainOpen) next.mainOpen = prev.mainOpen;
        if (prev.chat) next.chat = prev.chat;
        return next;
      });
      return;
    }

    // Open main panel imperatively if not already open
    const current = deriveOpenState(search);
    if (!current.mainOpen) {
      applyLayout(panelGroupRef, { ...current, mainOpen: true });
    }

    nav((prev) => {
      const next: Record<string, unknown> = {
        ...prev,
        main: view,
        mainOpen: 1,
      };
      if (opts?.id) next.id = opts.id;
      if (opts?.toolName) next.toolName = opts.toolName;
      return next;
    });
  };

  const closeMainView = () => {
    const current = deriveOpenState(search);
    applyLayout(panelGroupRef, { ...current, mainOpen: false });
    nav((prev) => {
      const next: Record<string, unknown> = {};
      if (prev.taskId) next.taskId = prev.taskId;
      if (prev.tasks) next.tasks = prev.tasks;
      if (prev.chat) next.chat = prev.chat;
      next.mainOpen = 0;
      return next;
    });
  };

  return {
    setChatOpen,
    setTasksOpen,
    setTaskId,
    createNewTask,
    openMainView,
    closeMainView,
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
