import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Suspense, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useProjectContext,
  useMCPClient,
  useConnections,
  SELF_MCP_ALIAS_ID,
} from "@decocms/mesh-sdk";
import type { ConnectionEntity } from "@decocms/mesh-sdk";
import { useInsetContext } from "@/web/layouts/agent-shell-layout";
import { KEYS } from "@/web/lib/query-keys";
import { toast } from "sonner";
import { Loading01 } from "@untitledui/icons";
import { AddConnectionDialog } from "@/web/views/virtual-mcp/add-connection-dialog";

interface Repo {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  private: boolean;
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
          <PickerContent onOpenChange={onOpenChange} />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}

function PickerContent({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  const { org } = useProjectContext();
  const inset = useInsetContext();
  const queryClient = useQueryClient();
  const [selectedConnection, setSelectedConnection] =
    useState<ConnectionEntity | null>(null);
  const [search, setSearch] = useState("");
  const [addConnectionOpen, setAddConnectionOpen] = useState(false);

  const selfClient = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  // Find all mcp-github connections in the organization
  const githubConnections = useConnections({ slug: "mcp-github" });

  // Check which org-wide GitHub connections are already on this virtual MCP
  const virtualMcpConnectionIds = new Set(
    (inset?.entity?.connections ?? []).map((c) => c.connection_id),
  );
  const attachedGithubConnections = githubConnections.filter((c) =>
    virtualMcpConnectionIds.has(c.id),
  );

  // Resolve the effective connection:
  // 1. If virtual MCP already has a GitHub connection, use it (auto-select if one, pick if multiple)
  // 2. If not, fall back to org-wide connections
  const resolvedConnections =
    attachedGithubConnections.length > 0
      ? attachedGithubConnections
      : githubConnections;

  const effectiveConnection =
    resolvedConnections.length === 1
      ? (resolvedConnections[0] ?? null)
      : selectedConnection;

  // Whether we need to add the connection to the virtual MCP before searching
  const needsAttach =
    effectiveConnection !== null &&
    !virtualMcpConnectionIds.has(effectiveConnection.id);

  // Create MCP client for the selected GitHub connection
  const githubClient = useMCPClient({
    connectionId: effectiveConnection?.id ?? "",
    orgId: org.id,
  });

  // Eagerly attach the connection to the virtual MCP as soon as it's resolved
  const attachMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      await addConnectionToVirtualMcp(connectionId);
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

  // Search repos via the GitHub MCP connection
  const reposQuery = useQuery({
    queryKey: KEYS.githubRepoSearch(
      org.id,
      effectiveConnection?.id ?? "",
      search,
    ),
    queryFn: async () => {
      if (!effectiveConnection || !search.trim()) return { repos: [] };
      const result = await githubClient.callTool({
        name: "search_repositories",
        arguments: { query: search },
      });
      const content = (result as { content?: Array<{ text?: string }> })
        .content?.[0]?.text;
      if (!content) return { repos: [] };
      try {
        const parsed = JSON.parse(content);
        // search_repositories returns { total_count, items: [...] }
        const items = (
          Array.isArray(parsed) ? parsed : (parsed.items ?? [])
        ) as Array<{
          full_name: string;
          owner?: { login: string };
          name: string;
          html_url: string;
          private: boolean;
        }>;
        return {
          repos: items.map((r) => {
            const [owner, name] = r.full_name.split("/");
            return {
              owner: r.owner?.login ?? owner ?? "",
              name: r.name ?? name ?? "",
              fullName: r.full_name,
              url: r.html_url,
              private: r.private,
            };
          }),
        };
      } catch {
        return { repos: [] };
      }
    },
    enabled: !!effectiveConnection && search.trim().length >= 2,
  });

  const invalidateVirtualMcp = () =>
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

  // Add a connection to the virtual MCP's connections list
  const addConnectionToVirtualMcp = async (connectionId: string) => {
    if (!inset?.entity) return;
    const existing = inset.entity.connections ?? [];
    if (existing.some((c) => c.connection_id === connectionId)) return;
    await selfClient.callTool({
      name: "COLLECTION_VIRTUAL_MCP_UPDATE",
      arguments: {
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
        },
      },
    });
    invalidateVirtualMcp();
  };

  // Save selected repo with connectionId
  const saveMutation = useMutation({
    mutationFn: async (repo: Repo) => {
      if (!inset?.entity || !effectiveConnection) {
        throw new Error("No virtual MCP context or GitHub connection");
      }
      await selfClient.callTool({
        name: "COLLECTION_VIRTUAL_MCP_UPDATE",
        arguments: {
          id: inset.entity.id,
          data: {
            metadata: {
              githubRepo: {
                owner: repo.owner,
                name: repo.name,
                connectionId: effectiveConnection.id,
              },
              activeVms: {},
            },
          },
        },
      });
    },
    onSuccess: (_data, repo) => {
      invalidateVirtualMcp();
      toast.success("GitHub repo connected");
      onOpenChange(false);

      // Background: detect runtime from the repo via the GitHub connection
      if (inset?.entity && effectiveConnection) {
        const entityId = inset.entity.id;

        const getFileContent = async (path: string) => {
          const result = await githubClient.callTool({
            name: "get_file_contents",
            arguments: { owner: repo.owner, repo: repo.name, path },
          });
          const content = (result as { content?: Array<{ text?: string }> })
            .content?.[0]?.text;
          if (!content) return null;
          try {
            const parsed = JSON.parse(content);
            return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
          } catch {
            return content;
          }
        };

        const fetchInstructions = async () => {
          for (const path of ["AGENTS.md", "CLAUDE.md"]) {
            const content = await getFileContent(path);
            if (content) {
              await selfClient.callTool({
                name: "COLLECTION_VIRTUAL_MCP_UPDATE",
                arguments: {
                  id: entityId,
                  data: { metadata: { instructions: content } },
                },
              });
              invalidateVirtualMcp();
              return;
            }
          }
        };

        const detectRuntime = async () => {
          const runtimeFiles: Array<{ file: string; runtime: string }> = [
            { file: "deno.json", runtime: "deno" },
            { file: "deno.jsonc", runtime: "deno" },
            { file: "bun.lock", runtime: "bun" },
            { file: "bunfig.toml", runtime: "bun" },
            { file: "pnpm-lock.yaml", runtime: "pnpm" },
            { file: "yarn.lock", runtime: "yarn" },
            { file: "package-lock.json", runtime: "npm" },
            { file: "package.json", runtime: "npm" },
          ];

          const installCommands: Record<string, string> = {
            deno: "deno install",
            bun: "bun install",
            pnpm: "pnpm install",
            yarn: "yarn install",
            npm: "npm install",
          };

          let detected: string | null = null;
          for (const { file, runtime } of runtimeFiles) {
            const content = await getFileContent(file);
            if (content !== null) {
              detected = runtime;
              break;
            }
          }

          if (!detected) return;

          const installScript = installCommands[detected] ?? "";
          let devScript = "";
          let devPort = "";

          if (detected === "deno") {
            for (const denoFile of ["deno.json", "deno.jsonc"]) {
              const content = await getFileContent(denoFile);
              if (content) {
                try {
                  const deno = JSON.parse(content) as {
                    tasks?: Record<string, string>;
                  };
                  const tasks = deno.tasks ?? {};
                  if (tasks.dev) {
                    devScript = "deno task dev";
                    const portMatch = tasks.dev.match(
                      /(?:--port|PORT=|:)(\d{4,5})/,
                    );
                    if (portMatch?.[1]) devPort = portMatch[1];
                  } else if (tasks.start) {
                    devScript = "deno task start";
                  }
                } catch {
                  // Invalid JSON
                }
                break;
              }
            }
          } else {
            const pkgContent = await getFileContent("package.json");
            if (pkgContent) {
              try {
                const pkg = JSON.parse(pkgContent) as {
                  scripts?: Record<string, string>;
                };
                const scripts = pkg.scripts ?? {};
                const runPrefix = `${detected} run`;
                if (scripts.dev) {
                  devScript = `${runPrefix} dev`;
                  const portMatch = scripts.dev.match(
                    /(?:--port|PORT=|:)(\d{4,5})/,
                  );
                  if (portMatch?.[1]) devPort = portMatch[1];
                } else if (scripts.start) {
                  devScript = `${runPrefix} start`;
                }
              } catch {
                // Invalid JSON
              }
            }
          }

          await selfClient.callTool({
            name: "COLLECTION_VIRTUAL_MCP_UPDATE",
            arguments: {
              id: entityId,
              data: {
                metadata: {
                  runtime: {
                    detected,
                    selected: detected,
                    installScript,
                    devScript,
                    port: devPort || "8000",
                  },
                },
              },
            },
          });
          invalidateVirtualMcp();
        };

        fetchInstructions().catch(() => {});
        detectRuntime().catch(() => {});
      }
    },
    onError: (error) => {
      toast.error(
        "Failed to connect repo: " +
          (error instanceof Error ? error.message : "Unknown error"),
      );
    },
  });

  const filteredRepos = (reposQuery.data?.repos ?? []).slice(0, 5);

  // No GitHub connections anywhere — open Add Connection dialog filtered by "github"
  if (githubConnections.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center gap-4 py-6">
          <p className="text-sm text-muted-foreground text-center">
            No GitHub connection found. Add one to connect a repository.
          </p>
          <button
            type="button"
            onClick={() => setAddConnectionOpen(true)}
            className="text-sm font-medium text-primary hover:underline"
          >
            Add GitHub connection
          </button>
        </div>
        <AddConnectionDialog
          open={addConnectionOpen}
          onOpenChange={setAddConnectionOpen}
          addedConnectionIds={new Set()}
          onAdd={() => {
            setAddConnectionOpen(false);
            queryClient.invalidateQueries({
              predicate: (query) => {
                const key = query.queryKey;
                return key[1] === org.id && key[3] === "collection";
              },
            });
          }}
          initialSearch="github"
          defaultTab="all"
        />
      </>
    );
  }

  // Multiple connections available, none selected — show picker
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

  // Repo search
  return (
    <div className="flex flex-col gap-3">
      {resolvedConnections.length > 1 && (
        <button
          type="button"
          onClick={() => setSelectedConnection(null)}
          className="text-xs text-muted-foreground hover:text-foreground self-start"
        >
          &larr; Change connection
        </button>
      )}
      <Input
        placeholder="Search repositories..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />
      {reposQuery.isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loading01 size={20} className="animate-spin text-muted-foreground" />
        </div>
      )}
      {!reposQuery.isLoading && (
        <div className="max-h-72 overflow-y-auto flex flex-col gap-1">
          {filteredRepos.length === 0 && search.trim().length >= 2 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No repositories found
            </p>
          ) : search.trim().length < 2 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Type at least 2 characters to search
            </p>
          ) : (
            filteredRepos.map((repo) => (
              <button
                key={repo.fullName}
                type="button"
                onClick={() => saveMutation.mutate(repo)}
                disabled={saveMutation.isPending}
                className="flex items-center justify-between p-2 rounded-md hover:bg-accent transition-colors text-left"
              >
                <span className="text-sm">
                  <span className="text-muted-foreground">{repo.owner}/</span>
                  {repo.name}
                </span>
                {repo.private && (
                  <span className="text-xs text-muted-foreground">private</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
