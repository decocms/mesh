import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { Suspense, useDeferredValue, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { invalidateVirtualMcpQueries } from "@/web/lib/query-keys";
import {
  useProjectContext,
  useMCPClient,
  useConnections,
  SELF_MCP_ALIAS_ID,
} from "@decocms/mesh-sdk";
import type { ConnectionEntity } from "@decocms/mesh-sdk";
import { KEYS } from "@/web/lib/query-keys";
import { toast } from "sonner";
import { ArrowLeft, Loading01, Lock01, LockUnlocked01 } from "@untitledui/icons";
import { useAutoInstallGitHub } from "@/web/hooks/use-auto-install-github";
import { useNavigateToAgent } from "@/web/hooks/use-navigate-to-agent";
import { usePreferences } from "@/web/hooks/use-preferences.ts";
import { GitHubIcon } from "@/web/components/icons/github-icon";

interface GitHubInstallation {
  installationId: number;
  login: string;
  avatarUrl: string;
  type: string;
}

interface Repo {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  private: boolean;
  description: string | null;
  updatedAt: string;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function GitHubRepoPicker({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [preferences] = usePreferences();

  if (!preferences.experimental_vibecode) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] h-[85svh] sm:h-[520px] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="sr-only">
          <DialogTitle>Import from GitHub</DialogTitle>
        </DialogHeader>
        <div className="flex items-center h-12 border-b border-border px-4 gap-3 shrink-0">
          <GitHubIcon className="size-4 text-foreground shrink-0" />
          <span className="text-sm font-medium text-foreground">
            Import from GitHub
          </span>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col min-w-0">
          <Suspense
            fallback={
              <div className="flex-1 flex items-center justify-center">
                <Loading01
                  size={18}
                  className="animate-spin text-muted-foreground"
                />
              </div>
            }
          >
            <PickerContent onComplete={() => onOpenChange(false)} />
          </Suspense>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PickerContent({ onComplete }: { onComplete: () => void }) {
  const { org } = useProjectContext();
  const queryClient = useQueryClient();
  const navigateToAgent = useNavigateToAgent();
  const [selectedConnection, setSelectedConnection] =
    useState<ConnectionEntity | null>(null);
  const [selectedInstallation, setSelectedInstallation] =
    useState<GitHubInstallation | null>(null);

  const githubConnections = useConnections({ slug: "mcp-github" });

  const autoInstall = useAutoInstallGitHub({
    enabled: githubConnections.length === 0,
  });

  const effectiveConnection =
    githubConnections.length === 1
      ? (githubConnections[0] ?? null)
      : selectedConnection;

  const githubClient = useMCPClient({
    connectionId: effectiveConnection?.id ?? "",
    orgId: org.id,
  });
  const selfClient = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const getFileContent = async (
    repo: Repo,
    path: string,
  ): Promise<string | null> => {
    try {
      const result = await githubClient.callTool({
        name: "get_file_contents",
        arguments: { owner: repo.owner, repo: repo.name, path },
      });
      const typed = result as {
        isError?: boolean;
        content?: Array<{
          type?: string;
          text?: string;
          resource?: { text?: string };
        }>;
      };
      if (typed.isError) return null;
      const resourceBlock = typed.content?.find((c) => c.type === "resource");
      const content = resourceBlock?.resource?.text;
      if (!content) return null;
      try {
        const parsed = JSON.parse(content);
        return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
      } catch {
        return content;
      }
    } catch {
      return null;
    }
  };

  const detectRepoFiles = (virtualMcpId: string, repo: Repo) => {
    const allPaths = [
      "AGENTS.md",
      "CLAUDE.md",
      "deno.json",
      "deno.jsonc",
      "bun.lock",
      "bunfig.toml",
      "pnpm-lock.yaml",
      "yarn.lock",
      "package-lock.json",
      "package.json",
    ];

    Promise.all(
      allPaths.map(async (p) => [p, await getFileContent(repo, p)] as const),
    )
      .then(async (entries) => {
        const files = new Map(entries);

        const instructions =
          files.get("AGENTS.md") ?? files.get("CLAUDE.md") ?? null;

        const runtimeFiles: Array<{ file: string; pm: string }> = [
          { file: "deno.json", pm: "deno" },
          { file: "deno.jsonc", pm: "deno" },
          { file: "bun.lock", pm: "bun" },
          { file: "bunfig.toml", pm: "bun" },
          { file: "pnpm-lock.yaml", pm: "pnpm" },
          { file: "yarn.lock", pm: "yarn" },
          { file: "package-lock.json", pm: "npm" },
          { file: "package.json", pm: "npm" },
        ];
        let detected: string | null = null;
        for (const { file, pm } of runtimeFiles) {
          if (files.get(file) !== null) {
            detected = pm;
            break;
          }
        }

        let devPort = "";
        if (detected) {
          const extractPort = (content: string | null) => {
            if (!content) return "";
            try {
              const parsed = JSON.parse(content) as {
                tasks?: Record<string, string>;
                scripts?: Record<string, string>;
              };
              const cmds = parsed.tasks ?? parsed.scripts ?? {};
              const devCmd = cmds.dev ?? cmds.start ?? "";
              const portMatch = devCmd.match(/(?:--port|PORT=|:)(\d{4,5})/);
              return portMatch?.[1] ?? "";
            } catch {
              return "";
            }
          };
          if (detected === "deno") {
            devPort =
              extractPort(files.get("deno.json") ?? null) ||
              extractPort(files.get("deno.jsonc") ?? null);
          } else {
            devPort = extractPort(files.get("package.json") ?? null);
          }
        }

        await selfClient.callTool({
          name: "COLLECTION_VIRTUAL_MCP_UPDATE",
          arguments: {
            id: virtualMcpId,
            data: {
              metadata: {
                instructions,
                runtime: { selected: detected, port: devPort || null },
              },
            },
          },
        });

        invalidateVirtualMcpQueries(queryClient, org.id);
      })
      .catch((err) => {
        console.error("GitHub repo file detection failed:", err);
      });
  };

  const importMutation = useMutation({
    mutationFn: async (repo: Repo) => {
      if (!effectiveConnection || !selectedInstallation) {
        throw new Error("No GitHub connection or installation");
      }

      const connectionId = effectiveConnection.id;

      const result = (await selfClient.callTool({
        name: "COLLECTION_VIRTUAL_MCP_CREATE",
        arguments: {
          data: {
            title: repo.name,
            description: repo.description || "Imported from GitHub",
            pinned: true,
            icon: null,
            metadata: {
              githubRepo: {
                owner: repo.owner,
                name: repo.name,
                url: repo.url,
                installationId: selectedInstallation.installationId,
                connectionId,
              },
              activeVms: {},
              instructions: null,
              runtime: null,
              ui: {
                pinnedViews: null,
                layout: {
                  defaultMainView: {
                    type: "preview",
                  },
                },
              },
            },
            connections: [{ connection_id: connectionId }],
          },
        },
      })) as { structuredContent?: unknown };

      const payload = (result.structuredContent ?? result) as {
        item: { id: string; title: string };
      };

      return {
        virtualMcpId: payload.item.id,
        repo,
        item: payload.item,
      };
    },
    onSuccess: ({ virtualMcpId, repo, item }) => {
      toast.success(`Imported ${repo.name} from GitHub`);

      queryClient.setQueryData(
        KEYS.collectionItem(
          selfClient,
          org.id,
          "",
          "VIRTUAL_MCP",
          virtualMcpId,
        ),
        { item },
      );
      invalidateVirtualMcpQueries(queryClient, org.id);

      onComplete();
      localStorage.setItem("mesh:sidebar-open", JSON.stringify(false));
      navigateToAgent(virtualMcpId);

      detectRepoFiles(virtualMcpId, repo);
    },
    onError: (error) => {
      toast.error(
        "Failed to import repo: " +
          (error instanceof Error ? error.message : "Unknown error"),
      );
    },
  });

  if (
    autoInstall.status === "installing" ||
    autoInstall.status === "authenticating"
  ) {
    return (
      <AutoInstallGitHubUI
        status={autoInstall.status}
        error={null}
        retry={autoInstall.retry}
      />
    );
  }

  if (autoInstall.status === "error") {
    return (
      <AutoInstallGitHubUI
        status="error"
        error={autoInstall.error}
        retry={autoInstall.retry}
      />
    );
  }

  if (githubConnections.length === 0 && autoInstall.status === "idle") {
    return (
      <AutoInstallGitHubUI
        status="installing"
        error={null}
        retry={autoInstall.retry}
      />
    );
  }

  if (githubConnections.length > 1 && !effectiveConnection) {
    return (
      <div className="flex flex-col py-2">
        <div className="px-4 py-2">
          <p className="text-xs font-medium text-muted-foreground">
            Select a connection
          </p>
        </div>
        {githubConnections.map((conn) => (
          <button
            key={conn.id}
            type="button"
            onClick={() => setSelectedConnection(conn)}
            className="flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors text-left"
          >
            {conn.icon ? (
              <img
                src={conn.icon}
                alt={conn.title}
                className="size-7 rounded-full shrink-0"
              />
            ) : (
              <div className="size-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                <GitHubIcon className="size-3.5 text-muted-foreground" />
              </div>
            )}
            <span className="text-sm font-medium">{conn.title}</span>
          </button>
        ))}
      </div>
    );
  }

  if (!effectiveConnection) return null;

  if (!selectedInstallation) {
    return (
      <InstallationPicker
        connectionId={effectiveConnection.id}
        orgId={org.id}
        onSelect={setSelectedInstallation}
        showBackButton={githubConnections.length > 1}
        onBack={() => setSelectedConnection(null)}
      />
    );
  }

  return (
    <RepoBrowser
      connectionId={effectiveConnection.id}
      orgId={org.id}
      installation={selectedInstallation}
      onBack={() => setSelectedInstallation(null)}
      onSelectRepo={(repo) => importMutation.mutate(repo)}
      isSaving={importMutation.isPending}
    />
  );
}

function InstallationPicker({
  connectionId,
  orgId,
  onSelect,
  showBackButton,
  onBack,
}: {
  connectionId: string;
  orgId: string;
  onSelect: (installation: GitHubInstallation) => void;
  showBackButton: boolean;
  onBack: () => void;
}) {
  const selfClient = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId,
  });

  const installationsQuery = useQuery({
    queryKey: KEYS.githubUserOrgs(orgId, connectionId),
    queryFn: async () => {
      const result = await selfClient.callTool({
        name: "GITHUB_LIST_USER_ORGS",
        arguments: { connectionId },
      });
      const content = (result as { content?: Array<{ text?: string }> })
        .content?.[0]?.text;
      if (!content) throw new Error("No response from GITHUB_LIST_USER_ORGS");
      return JSON.parse(content) as {
        installations: GitHubInstallation[];
        appSlug?: string;
      };
    },
  });

  if (installationsQuery.isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loading01 size={18} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (installationsQuery.isError) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-destructive">Failed to load GitHub accounts</p>
      </div>
    );
  }

  const data = installationsQuery.data;
  if (!data) return null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {showBackButton && (
        <div className="flex items-center gap-1 px-4 pt-3 pb-1 shrink-0">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={12} />
            Change connection
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
      {data.installations.map((inst) => (
        <button
          key={inst.installationId}
          type="button"
          onClick={() => onSelect(inst)}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors text-left group"
        >
          <img
            src={inst.avatarUrl}
            alt={inst.login}
            className="size-7 rounded-full shrink-0 ring-1 ring-border"
          />
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-medium leading-none">
              {inst.login}
            </span>
            {inst.type === "User" && (
              <span className="text-xs text-muted-foreground mt-1">
                Personal account
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            Select →
          </span>
        </button>
      ))}
      </div>

      <div className="px-4 py-3 border-t border-border shrink-0">
        <a
          href={
            data.appSlug
              ? `https://github.com/apps/${data.appSlug}/installations/new`
              : "https://github.com/settings/installations"
          }
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Account not listed?{" "}
          <span className="underline underline-offset-2">
            Install the GitHub App
          </span>
        </a>
      </div>
    </div>
  );
}

function RepoBrowser({
  connectionId,
  orgId,
  installation,
  onBack,
  onSelectRepo,
  isSaving,
}: {
  connectionId: string;
  orgId: string;
  installation: GitHubInstallation;
  onBack: () => void;
  onSelectRepo: (repo: Repo) => void;
  isSaving: boolean;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const isStale = query !== deferredQuery;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
          aria-label="Back to accounts"
        >
          <ArrowLeft size={16} />
        </button>
        <img
          src={installation.avatarUrl}
          alt={installation.login}
          className="size-5 rounded-full ring-1 ring-border shrink-0"
        />
        <span className="text-sm font-medium text-foreground">
          {installation.login}
        </span>
      </div>

      <CollectionSearch
        placeholder="Search repositories..."
        value={query}
        onChange={setQuery}
        isSearching={isStale}
      />

      <div
        className={cn(
          "flex-1 overflow-hidden flex flex-col transition-opacity duration-150",
          isStale ? "opacity-40" : "opacity-100",
        )}
      >
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center">
              <Loading01
                size={18}
                className="animate-spin text-muted-foreground"
              />
            </div>
          }
        >
          <RepoList
            connectionId={connectionId}
            orgId={orgId}
            installation={installation}
            query={deferredQuery}
            onSelectRepo={onSelectRepo}
            isSaving={isSaving}
          />
        </Suspense>
      </div>
    </div>
  );
}

function RepoList({
  connectionId,
  orgId,
  installation,
  query,
  onSelectRepo,
  isSaving,
}: {
  connectionId: string;
  orgId: string;
  installation: GitHubInstallation;
  query: string;
  onSelectRepo: (repo: Repo) => void;
  isSaving: boolean;
}) {
  const githubClient = useMCPClient({ connectionId, orgId });

  const qualifier = installation.type === "User" ? "user" : "org";
  const searchQuery = query
    ? `${qualifier}:${installation.login} ${query} in:name`
    : `${qualifier}:${installation.login}`;

  const { data: repos } = useSuspenseQuery({
    queryKey: KEYS.githubOrgRepos(
      orgId,
      connectionId,
      installation.login,
      query,
    ),
    queryFn: async () => {
      const result = await githubClient.callTool({
        name: "search_repositories",
        arguments: { query: searchQuery, page: 1, perPage: 30 },
      });
      const content = (result as { content?: Array<{ text?: string }> })
        .content?.[0]?.text;
      if (!content) throw new Error("No response from search_repositories");
      const parsed = JSON.parse(content) as {
        items?: Array<{
          name: string;
          full_name: string;
          html_url: string;
          private: boolean;
          description: string | null;
          updated_at: string;
        }>;
      };
      return (parsed.items ?? []).map((r) => ({
        name: r.name,
        fullName: r.full_name,
        owner: r.full_name.split("/")[0] ?? "",
        url: r.html_url,
        private: r.private,
        description: r.description,
        updatedAt: r.updated_at,
      }));
    },
  });

  if (repos.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-1">
        <p className="text-sm text-muted-foreground">No repositories found</p>
        {query && (
          <p className="text-xs text-muted-foreground/60">
            Try a different search term
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col [scrollbar-gutter:stable]">
      {repos.map((repo) => (
        <button
          key={repo.fullName}
          type="button"
          onClick={() => onSelectRepo(repo)}
          disabled={isSaving}
          className="flex items-start gap-3 px-4 py-3 hover:bg-accent transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <GitHubIcon className="size-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-sm font-medium truncate">{repo.name}</span>
          </div>
          <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0 leading-none">
            {repo.private ? (
              <Lock01 size={10} />
            ) : (
              <LockUnlocked01 size={10} />
            )}
            {repo.private ? "Private" : "Public"}
          </span>
        </button>
      ))}
    </div>
  );
}

function AutoInstallGitHubUI({
  status,
  error,
  retry,
}: {
  status: string;
  error: string | null;
  retry: () => void;
}) {
  if (status === "error") {
    return (
      <div className="flex flex-col items-center gap-4 px-6 py-10">
        <div className="size-10 rounded-full bg-destructive/10 flex items-center justify-center">
          <GitHubIcon className="size-5 text-destructive" />
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-sm font-medium">Connection failed</p>
          <p className="text-xs text-muted-foreground max-w-[260px] leading-relaxed">
            {error ?? "Something went wrong while connecting to GitHub."}
          </p>
        </div>
        <button
          type="button"
          onClick={retry}
          className="text-xs font-medium text-foreground border border-border rounded-md px-3 py-1.5 hover:bg-accent transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  const isAuthenticating = status === "authenticating";

  return (
    <div className="flex flex-col items-center gap-4 px-6 py-10">
      <div className="relative size-10">
        <div className="size-10 rounded-full bg-muted flex items-center justify-center">
          <GitHubIcon className="size-5 text-foreground" />
        </div>
        <div className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full bg-background flex items-center justify-center">
          <Loading01 size={12} className="animate-spin text-muted-foreground" />
        </div>
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-sm font-medium">
          {isAuthenticating
            ? "Authenticating with GitHub"
            : "Setting up GitHub"}
        </p>
        <p className="text-xs text-muted-foreground">
          {isAuthenticating
            ? "Complete the OAuth flow in your browser"
            : "Installing the GitHub connection..."}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "size-1.5 rounded-full",
            !isAuthenticating
              ? "bg-foreground animate-pulse"
              : "bg-muted-foreground/30",
          )}
        />
        <span
          className={cn(
            "size-1.5 rounded-full",
            isAuthenticating
              ? "bg-foreground animate-pulse"
              : "bg-muted-foreground/30",
          )}
        />
        <span className="size-1.5 rounded-full bg-muted-foreground/30" />
      </div>
    </div>
  );
}
