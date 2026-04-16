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
import {
  useProjectContext,
  useMCPClient,
  useConnections,
  useVirtualMCPActions,
  SELF_MCP_ALIAS_ID,
} from "@decocms/mesh-sdk";
import type { ConnectionEntity } from "@decocms/mesh-sdk";
import { useInsetContext } from "@/web/layouts/agent-shell-layout";
import { KEYS } from "@/web/lib/query-keys";
import { toast } from "sonner";
import { Loading01 } from "@untitledui/icons";
import { useAutoInstallGitHub } from "@/web/hooks/use-auto-install-github";

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Connect GitHub Repository</DialogTitle>
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

export function PickerContent({ onComplete }: { onComplete: () => void }) {
  const { org } = useProjectContext();
  const inset = useInsetContext();
  const queryClient = useQueryClient();
  const [selectedConnection, setSelectedConnection] =
    useState<ConnectionEntity | null>(null);
  const [selectedInstallation, setSelectedInstallation] =
    useState<GitHubInstallation | null>(null);

  const actions = useVirtualMCPActions();

  // Find all mcp-github connections in the organization
  const githubConnections = useConnections({ slug: "mcp-github" });

  // Auto-install hook — only enabled when no connections exist
  const autoInstall = useAutoInstallGitHub({
    enabled: githubConnections.length === 0,
  });

  // Check which org-wide GitHub connections are already on this virtual MCP
  const virtualMcpConnectionIds = new Set(
    (inset?.entity?.connections ?? []).map((c) => c.connection_id),
  );
  const attachedGithubConnections = githubConnections.filter((c) =>
    virtualMcpConnectionIds.has(c.id),
  );

  // Resolve the effective connection:
  // 1. If virtual MCP already has a GitHub connection, use it
  // 2. If not, fall back to org-wide connections
  const resolvedConnections =
    attachedGithubConnections.length > 0
      ? attachedGithubConnections
      : githubConnections;

  const effectiveConnection =
    resolvedConnections.length === 1
      ? (resolvedConnections[0] ?? null)
      : selectedConnection;

  // Whether we need to add the connection to the virtual MCP before proceeding
  const needsAttach =
    effectiveConnection !== null &&
    !virtualMcpConnectionIds.has(effectiveConnection.id);

  // Create MCP client for the selected GitHub connection (used for post-selection get_file_contents)
  const githubClient = useMCPClient({
    connectionId: effectiveConnection?.id ?? "",
    orgId: org.id,
  });

  // Eagerly attach the connection to the virtual MCP as soon as it's resolved
  const attachMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      if (!inset?.entity) return;
      const existing = inset.entity.connections ?? [];
      if (existing.some((c) => c.connection_id === connectionId)) return;
      await actions.update.mutateAsync({
        id: inset.entity.id,
        data: {
          connections: [
            ...existing,
            {
              connection_id: connectionId,
              selected_tools: null,
              selected_resources: null,
              selected_prompts: null,
            },
          ],
        } as any,
      });
    },
  });

  if (
    needsAttach &&
    effectiveConnection &&
    !attachMutation.isPending &&
    !attachMutation.isSuccess
  ) {
    attachMutation.mutate(effectiveConnection.id);
  }

  // Save selected repo with connectionId
  const saveMutation = useMutation({
    mutationFn: async (repo: Repo) => {
      if (!inset?.entity || !effectiveConnection) {
        throw new Error("No virtual MCP context or GitHub connection");
      }
      await actions.update.mutateAsync({
        id: inset.entity.id,
        data: {
          metadata: {
            githubRepo: {
              owner: repo.owner,
              name: repo.name,
              url: repo.url,
              installationId: selectedInstallation!.installationId,
              connectionId: effectiveConnection.id,
            },
            activeVms: {},
          },
        } as any,
      });
    },
    onSuccess: (_data, repo) => {
      console.log("[GitHubRepoPicker] saveMutation onSuccess");
      toast.success("GitHub repo connected");

      // Detect runtime from the repo via the GitHub connection, then close
      if (inset?.entity && effectiveConnection) {
        const entityId = inset.entity.id;

        const getFileContent = async (path: string) => {
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
          // get_file_contents returns file data inside a resource content block
          const resourceBlock = typed.content?.find(
            (c) => c.type === "resource",
          );
          const content = resourceBlock?.resource?.text;
          if (!content) return null;
          try {
            const parsed = JSON.parse(content);
            return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
          } catch {
            return content;
          }
        };

        const fetchInstructions = async (files: Map<string, string | null>) => {
          const content = files.get("AGENTS.md") ?? files.get("CLAUDE.md");
          if (content) {
            await actions.update.mutateAsync({
              id: entityId,
              data: { metadata: { instructions: content } } as any,
            });
          }
        };

        const detectRuntime = async (files: Map<string, string | null>) => {
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

          // Extract port from dev/start script if possible
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

          await actions.update.mutateAsync({
            id: entityId,
            data: {
              metadata: {
                runtime: {
                  selected: detected,
                  port: devPort || null,
                },
              },
            } as any,
          });
        };

        // Fetch all files in parallel, then run detection from the results
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
          allPaths.map(async (p) => [p, await getFileContent(p)] as const),
        )
          .then((entries) => {
            const files = new Map(entries);
            return Promise.allSettled([
              fetchInstructions(files),
              detectRuntime(files),
            ]);
          })
          .then(() => {
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
            onComplete();
          });
      } else {
        onComplete();
      }
    },
    onError: (error) => {
      toast.error(
        "Failed to connect repo: " +
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
  if (resolvedConnections.length > 1 && !effectiveConnection) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          Select a GitHub connection:
        </p>
        {resolvedConnections.map((conn) => (
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
        showBackButton={resolvedConnections.length > 1}
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
      onSelectRepo={(repo) => saveMutation.mutate(repo)}
      isSaving={saveMutation.isPending}
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

  const searchQuery = query
    ? `org:${installation.login} ${query} in:name`
    : `org:${installation.login}`;

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
