import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import { SearchInput } from "@deco/ui/components/search-input.tsx";
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
import { Loading01 } from "@untitledui/icons";
import { useAutoInstallGitHub } from "@/web/hooks/use-auto-install-github";
import { useNavigateToAgent } from "@/web/hooks/use-navigate-to-agent";
import { usePreferences } from "@/web/hooks/use-preferences.ts";

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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import from GitHub</DialogTitle>
        </DialogHeader>
        <div className="min-w-0">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-8">
                <Loading01
                  size={20}
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

  // Find all mcp-github connections in the organization
  const githubConnections = useConnections({ slug: "mcp-github" });

  // Auto-install hook — only enabled when no connections exist
  const autoInstall = useAutoInstallGitHub({
    enabled: githubConnections.length === 0,
  });

  const effectiveConnection =
    githubConnections.length === 1
      ? (githubConnections[0] ?? null)
      : selectedConnection;

  // MCP clients
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

        // Detect instructions
        const instructions =
          files.get("AGENTS.md") ?? files.get("CLAUDE.md") ?? null;

        // Detect runtime
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

        // Update the virtual MCP with detected metadata
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

  // Import mutation: create virtual MCP + detect runtime/instructions
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
                  chatDefaultOpen: false,
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

      // Seed cache so navigation is instant
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

      // Navigate immediately, detect runtime/instructions in background
      onComplete();
      localStorage.setItem("mesh:sidebar-open", JSON.stringify(false));
      navigateToAgent(virtualMcpId);

      // Background: fetch files and update metadata
      detectRepoFiles(virtualMcpId, repo);
    },
    onError: (error) => {
      toast.error(
        "Failed to import repo: " +
          (error instanceof Error ? error.message : "Unknown error"),
      );
    },
  });

  // Auto-install in progress — keep showing progress UI until flow completes
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

  // No GitHub connections and auto-install is idle (shouldn't happen, but safety net)
  if (githubConnections.length === 0 && autoInstall.status === "idle") {
    return (
      <AutoInstallGitHubUI
        status="installing"
        error={null}
        retry={autoInstall.retry}
      />
    );
  }

  // Multiple connections, none selected — show connection picker
  if (githubConnections.length > 1 && !effectiveConnection) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          Select a GitHub connection:
        </p>
        {githubConnections.map((conn) => (
          <button
            key={conn.id}
            type="button"
            onClick={() => setSelectedConnection(conn)}
            className="flex items-center gap-3 p-3 rounded-md border hover:bg-accent transition-colors text-left"
          >
            {conn.icon && (
              <img
                src={conn.icon}
                alt={conn.title}
                className="size-8 rounded-full"
              />
            )}
            <span className="text-sm font-medium">{conn.title}</span>
          </button>
        ))}
      </div>
    );
  }

  // Connection resolved — show org picker or repo browser
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
      <div className="flex items-center justify-center py-8">
        <Loading01 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (installationsQuery.isError) {
    return (
      <p className="text-sm text-destructive text-center py-4">
        Failed to load GitHub accounts
      </p>
    );
  }

  const data = installationsQuery.data;
  if (!data) return null;

  return (
    <div className="flex flex-col gap-2">
      {showBackButton && (
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground self-start"
        >
          &larr; Change connection
        </button>
      )}
      <p className="text-sm text-muted-foreground">Select an account:</p>

      {data.installations.map((inst) => (
        <button
          key={inst.installationId}
          type="button"
          onClick={() => onSelect(inst)}
          className="flex items-center gap-3 p-3 rounded-md border hover:bg-accent transition-colors text-left"
        >
          <img
            src={inst.avatarUrl}
            alt={inst.login}
            className="size-8 rounded-full"
          />
          <div className="flex flex-col">
            <span className="text-sm font-medium">{inst.login}</span>
            {inst.type === "User" && (
              <span className="text-xs text-muted-foreground">
                Personal account
              </span>
            )}
          </div>
        </button>
      ))}

      <a
        href={
          data.appSlug
            ? `https://github.com/apps/${data.appSlug}/installations/new`
            : "https://github.com/settings/installations"
        }
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-primary hover:underline text-center pt-2"
      >
        Account not listed? Install the GitHub App
      </a>
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
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onBack}
        className="text-xs text-muted-foreground hover:text-foreground self-start"
      >
        &larr; {installation.login}
      </button>

      <SearchInput
        placeholder="Search repositories..."
        value={query}
        onChange={setQuery}
        isSearching={isStale}
      />

      <div
        style={{
          opacity: isStale ? 0.5 : 1,
          transition: isStale
            ? "opacity 0.2s 0.2s linear"
            : "opacity 0s 0s linear",
        }}
      >
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-8">
              <Loading01
                size={20}
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
      <p className="text-sm text-muted-foreground text-center py-4">
        No repositories found
      </p>
    );
  }

  return (
    <div className="max-h-72 overflow-y-auto overflow-x-hidden flex flex-col gap-1">
      {repos.map((repo) => (
        <button
          key={repo.fullName}
          type="button"
          onClick={() => onSelectRepo(repo)}
          disabled={isSaving}
          className="flex items-center gap-2 p-2 rounded-md hover:bg-accent transition-colors text-left"
        >
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-medium truncate">{repo.name}</span>
            {repo.description && (
              <p className="text-xs text-muted-foreground truncate m-0">
                {repo.description}
              </p>
            )}
          </div>
          {repo.private && (
            <span className="text-xs text-muted-foreground shrink-0">
              private
            </span>
          )}
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
      <div className="flex flex-col items-center gap-3 py-6">
        <p className="text-sm text-destructive text-center">{error}</p>
        <button
          type="button"
          onClick={retry}
          className="text-sm font-medium text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 py-8">
      <Loading01 size={20} className="animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        {status === "authenticating"
          ? "Authenticating with GitHub..."
          : "Setting up GitHub..."}
      </p>
    </div>
  );
}
