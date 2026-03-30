import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { ArrowLeft } from "@untitledui/icons";
import { authClient } from "@/web/lib/auth-client";
import { generatePrefixedId } from "@/shared/utils/generate-id";
import { KEYS } from "@/web/lib/query-keys";
import { generateSlug } from "@/web/lib/slug";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";

interface GitHubRepo {
  id: number;
  full_name: string;
  name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  owner: { login: string; avatar_url: string };
  updated_at: string | null;
}

interface GitHubReposResponse {
  connected: boolean;
  repos: GitHubRepo[];
  configureUrl: string | null;
  installUrl: string | null;
  needsInstall?: boolean; // no installation found — user must install the app first
  error?: string;
}

interface GitHubStatusResponse {
  connected: boolean;
}

async function loadGitHubStatus(): Promise<GitHubStatusResponse> {
  const res = await fetch("/api/github-repos/status");
  if (!res.ok) throw new Error("Failed to check GitHub status");
  return res.json() as Promise<GitHubStatusResponse>;
}

async function loadGitHubRepos(): Promise<GitHubReposResponse> {
  const res = await fetch("/api/github-repos");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      body.error ?? `Failed to load repositories (${res.status})`,
    );
  }
  return res.json() as Promise<GitHubReposResponse>;
}

interface ImportFromGitHubDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack?: () => void;
}

type VirtualMCPCreateOutput = {
  item: {
    id: string;
    title: string;
    metadata?: {
      ui?: { slug?: string } | null;
      migrated_project_slug?: string;
    } | null;
  };
};

export function ImportFromGitHubDialog({
  open,
  onOpenChange,
  onBack,
}: ImportFromGitHubDialogProps) {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;

  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [connectingOAuth, setConnectingOAuth] = useState(false);
  const [waitingForInstall, setWaitingForInstall] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const {
    data: statusData,
    isLoading: isStatusLoading,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: KEYS.githubStatus(userId),
    queryFn: loadGitHubStatus,
    enabled: open && Boolean(userId),
    staleTime: 30_000,
    retry: false,
  });

  const isConnected = statusData?.connected ?? false;

  const {
    data: reposData,
    isLoading: isReposLoading,
    error: reposError,
    refetch: refetchRepos,
  } = useQuery({
    queryKey: KEYS.githubRepos(userId),
    queryFn: loadGitHubRepos,
    enabled: open && isConnected,
    staleTime: 60_000,
    retry: false,
  });

  const repos = reposData?.repos ?? [];

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setWaitingForInstall(false);
  }, []);

  const startPollingForRepos = useCallback(() => {
    setWaitingForInstall(true);
    stopPolling();
    pollRef.current = setInterval(async () => {
      const result = await refetchRepos();
      if ((result.data?.repos?.length ?? 0) > 0) {
        stopPolling();
      }
    }, 4000);
  }, [refetchRepos, stopPolling]);

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSelectedRepo(null);
      setSearch("");
      setConnectingOAuth(false);
      stopPolling();
    }
    onOpenChange(nextOpen);
  };

  const filteredRepos = repos.filter(
    (r) =>
      r.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (r.description ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const isSelectedVisible =
    !selectedRepo || filteredRepos.some((r) => r.full_name === selectedRepo);

  const handleConnectGitHub = async () => {
    setConnectingOAuth(true);
    try {
      const res = await fetch("/api/github-repos/auth/url");
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Failed to start GitHub OAuth");
        return;
      }
      const data = (await res.json()) as { url: string };

      const popup = window.open(
        data.url,
        "github-oauth",
        "width=600,height=700,left=200,top=100",
      );
      popupRef.current = popup;

      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === "github-oauth-success") {
          window.removeEventListener("message", handleMessage);
          setConnectingOAuth(false);
          queryClient.invalidateQueries({
            queryKey: KEYS.githubStatus(userId),
          });
          queryClient.invalidateQueries({
            queryKey: KEYS.githubRepos(userId),
          });
          refetchStatus();

          // Repo selection happened inside the popup (installation flow).
          // The repos list will refresh via the query invalidation above.
        } else if (event.data?.type === "github-oauth-error") {
          window.removeEventListener("message", handleMessage);
          setConnectingOAuth(false);
          toast.error(event.data.error ?? "GitHub OAuth failed");
        }
      };

      window.addEventListener("message", handleMessage);

      // Detect popup closed without completing OAuth
      const pollClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(pollClosed);
          window.removeEventListener("message", handleMessage);
          setConnectingOAuth(false);
        }
      }, 500);
    } catch {
      setConnectingOAuth(false);
      toast.error("Failed to start GitHub OAuth");
    }
  };

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/github-repos/auth/disconnect", {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.githubStatus(userId) });
      queryClient.invalidateQueries({ queryKey: KEYS.githubRepos(userId) });
      setSelectedRepo(null);
      setSearch("");
    },
    onError: () => {
      toast.error("Failed to disconnect GitHub account");
    },
  });

  const importMutation = useMutation({
    mutationFn: async (repoFullName: string) => {
      const connId = generatePrefixedId("conn");
      const adminConnId = generatePrefixedId("conn");

      const connRes = await fetch("/api/github-repos/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoFullName,
          connId,
          adminConnId,
          orgId: org.id,
        }),
      });
      const connBody = (await connRes.json().catch(() => ({}))) as {
        connId?: string;
        adminConnId?: string | null;
        decoSiteName?: string | null;
        error?: string;
      };
      if (!connRes.ok) {
        throw new Error(
          connBody.error ?? `Failed to create connection (${connRes.status})`,
        );
      }

      const hasAdminConn = Boolean(connBody.adminConnId);

      const repoName = repoFullName.split("/")[1] ?? repoFullName;
      const slug = generateSlug(repoName);

      const connections = [{ connection_id: connId }];
      if (hasAdminConn) {
        connections.push({ connection_id: connBody.adminConnId! });
      }

      const adminId = connBody.adminConnId;
      const pinnedViews = hasAdminConn
        ? [
            {
              connectionId: adminId,
              toolName: "file_explorer",
              label: "Preview",
              icon: null,
            },
            {
              connectionId: adminId,
              toolName: "fetch_assets",
              label: "Assets",
              icon: null,
            },
            {
              connectionId: adminId,
              toolName: "get_monitor_data",
              label: "Monitor",
              icon: null,
            },
          ]
        : [];

      const defaultMainView = hasAdminConn
        ? {
            type: "ext-apps",
            id: adminId,
            toolName: "file_explorer",
          }
        : null;

      const result = (await client.callTool({
        name: "COLLECTION_VIRTUAL_MCP_CREATE",
        arguments: {
          data: {
            title: repoFullName,
            description: `GitHub repository: ${repoFullName}`,
            pinned: true,
            icon: "icon://Code02?color=slate",
            subtype: "project",
            metadata: {
              instructions: null,
              enabled_plugins: [],
              ui: {
                banner: null,
                bannerColor: "#1F2328",
                icon: null,
                themeColor: "#1F2328",
                slug,
                pinnedViews,
                layout: { defaultMainView },
              },
            },
            connections,
          },
        },
      })) as { structuredContent?: unknown };

      const payload = (result.structuredContent ??
        result) as VirtualMCPCreateOutput;

      return {
        slug,
        virtualMcpId: payload.item.id,
        connId,
        item: payload.item,
      };
    },
    onSuccess: ({ slug, virtualMcpId, item }) => {
      queryClient.setQueryData(
        KEYS.collectionItem(client, org.id, "", "VIRTUAL_MCP", virtualMcpId),
        { item },
      );

      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            key[1] === org.id &&
            key[3] === "collection" &&
            key[4] === "VIRTUAL_MCP"
          );
        },
      });
      queryClient.invalidateQueries({ queryKey: KEYS.projects(org.id) });
      toast.success(`Imported ${slug} from GitHub`);
      handleClose(false);
      localStorage.setItem("mesh:sidebar-open", JSON.stringify(false));
      navigate({
        to: "/$org/$virtualMcpId",
        params: {
          org: org.slug,
          virtualMcpId,
        },
      });
    },
    onError: (err) => {
      toast.error(
        "Import failed: " +
          (err instanceof Error ? err.message : "Unknown error"),
      );
    },
  });

  const isLoading = isStatusLoading || (isConnected && isReposLoading);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[900px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Import from GitHub</DialogTitle>
        </DialogHeader>

        <div className="flex items-center h-12 border-b border-border px-4 gap-3">
          <button
            type="button"
            onClick={() => (onBack ? onBack() : handleClose(false))}
            className="flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="text-sm font-medium text-foreground">
            Import from GitHub
          </span>
        </div>

        {!isStatusLoading && !isConnected ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16 px-8">
            <div className="flex flex-col items-center gap-2 text-center">
              <p className="text-sm font-medium text-foreground">
                Connect your GitHub account
              </p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Authorize the GitHub App to list repositories you&apos;ve given
                access to.
              </p>
            </div>
            <Button
              onClick={handleConnectGitHub}
              disabled={connectingOAuth}
              className="gap-2"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-4 fill-current"
                aria-hidden="true"
              >
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              {connectingOAuth ? "Connecting…" : "Connect with GitHub"}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center border-b border-border">
              <div className="flex-1">
                <CollectionSearch
                  value={search}
                  onChange={setSearch}
                  placeholder="Search repositories..."
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setSearch("");
                  }}
                />
              </div>
              {(reposData?.configureUrl ?? reposData?.installUrl) && (
                <a
                  href={reposData.configureUrl ?? reposData.installUrl ?? ""}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-1.5 px-4 text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
                >
                  {reposData.configureUrl
                    ? "Configure access on GitHub"
                    : "Install GitHub App"}
                  <svg
                    viewBox="0 0 24 24"
                    className="size-3 fill-none stroke-current stroke-2"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"
                    />
                  </svg>
                </a>
              )}
            </div>

            <div className="pb-0 min-h-[300px]">
              {isLoading && (
                <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
                  Loading repositories...
                </div>
              )}

              {!isLoading && !reposError && repos.length === 0 && (
                <div className="flex flex-col items-center justify-center h-48 gap-4 px-8 text-center">
                  {reposData?.needsInstall ? (
                    <>
                      <div className="flex flex-col gap-1">
                        <p className="text-sm font-medium text-foreground">
                          No repository access yet
                        </p>
                        <p className="text-xs text-muted-foreground max-w-xs">
                          Install the GitHub App on your account and select
                          which repositories to grant access to.
                        </p>
                      </div>
                      {reposData.installUrl && (
                        <a
                          href={reposData.installUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => {
                            // Invalidate after user returns from GitHub
                            setTimeout(() => {
                              queryClient.invalidateQueries({
                                queryKey: KEYS.githubRepos(userId),
                              });
                            }, 3000);
                          }}
                        >
                          <Button size="sm" variant="outline" className="gap-2">
                            <svg
                              viewBox="0 0 24 24"
                              className="size-3.5 fill-current"
                              aria-hidden="true"
                            >
                              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                            </svg>
                            Install GitHub App
                          </Button>
                        </a>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No repositories found.
                    </p>
                  )}
                </div>
              )}

              {!isLoading && reposError && (
                <div className="flex items-center justify-center h-48 text-sm text-destructive">
                  {reposError instanceof Error
                    ? reposError.message
                    : "Failed to load repositories"}
                </div>
              )}

              {!isLoading && repos.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-h-[420px] overflow-y-auto py-4 px-8 [scrollbar-gutter:stable]">
                  {filteredRepos.length === 0 && (
                    <p className="col-span-3 text-sm text-muted-foreground text-center py-8">
                      No repositories match &ldquo;{search}&rdquo;
                    </p>
                  )}
                  {filteredRepos.map((repo) => {
                    const isSelected = selectedRepo === repo.full_name;
                    return (
                      <button
                        key={repo.id}
                        type="button"
                        onClick={() => setSelectedRepo(repo.full_name)}
                        className={cn(
                          "flex flex-col rounded-xl border overflow-hidden text-left transition-all cursor-pointer",
                          isSelected
                            ? "border-primary ring-1 ring-primary"
                            : "border-border hover:border-muted-foreground/40",
                        )}
                      >
                        {/* Owner avatar banner */}
                        <div className="w-full h-20 bg-muted overflow-hidden flex items-center justify-center">
                          <img
                            src={repo.owner.avatar_url}
                            alt={repo.owner.login}
                            className="size-12 rounded-full"
                            loading="lazy"
                          />
                        </div>
                        {/* Info */}
                        <div className="px-4 py-3">
                          <p className="text-sm font-medium text-foreground truncate">
                            {repo.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {repo.owner.login}
                            {repo.private ? " · Private" : " · Public"}
                          </p>
                          {repo.description && (
                            <p className="text-xs text-muted-foreground truncate mt-1">
                              {repo.description}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <DialogFooter className="px-8 py-5 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                className="mr-auto text-muted-foreground hover:text-destructive"
                onClick={() => disconnectMutation.mutate()}
                disabled={
                  disconnectMutation.isPending || importMutation.isPending
                }
              >
                {disconnectMutation.isPending
                  ? "Disconnecting…"
                  : "Disconnect GitHub"}
              </Button>
              {reposData?.needsInstall && (
                <Button
                  variant="outline"
                  onClick={() => refetchRepos()}
                  disabled={isReposLoading}
                >
                  {isReposLoading ? "Checking…" : "Refresh"}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => handleClose(false)}
                disabled={importMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                disabled={
                  !selectedRepo ||
                  !isSelectedVisible ||
                  importMutation.isPending ||
                  isLoading
                }
                onClick={() =>
                  selectedRepo && importMutation.mutate(selectedRepo)
                }
              >
                {importMutation.isPending ? "Importing..." : "Import"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
