/**
 * PR panel data hooks.
 *
 * Both reads and writes go through the existing `useMCPToolCallQuery` /
 * `useMCPToolCallMutation` against the github-mcp-server downstream
 * connection — no new mesh tools or endpoints. Polling 60s when active.
 *
 * github-mcp-server returns results as either `structuredContent` (parsed)
 * or `content: [{ type: "text", text: "<json>" }]` (stringified). The
 * extract* helpers normalize both shapes.
 */

import { useMCPClient, useMCPToolCallQuery } from "@decocms/mesh-sdk";

import { extractToolJson } from "./extract-tool-json.ts";

export interface PrSummary {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  merged: boolean;
  mergedAt: string | null;
  base: string;
  head: string;
  htmlUrl: string;
  author: string;
}

const POLL = 60_000;
const STALE = 30_000;

interface RepoArgs {
  orgId: string;
  connectionId: string;
  owner: string;
  repo: string;
}

export interface PrFile {
  filename: string;
  status:
    | "added"
    | "removed"
    | "modified"
    | "renamed"
    | "copied"
    | "changed"
    | "unchanged";
  additions: number;
  deletions: number;
  blobUrl: string | null;
}


/**
 * Fetches the first PR matching a branch head (open or closed).
 * Returns null when no PR exists yet for that branch.
 */
export function usePrByBranch(args: RepoArgs & { branch: string | null }) {
  const client = useMCPClient({
    connectionId: args.connectionId,
    orgId: args.orgId,
  });

  return useMCPToolCallQuery<PrSummary | null>({
    client,
    toolName: "list_pull_requests",
    toolArguments: {
      owner: args.owner,
      repo: args.repo,
      state: "all",
      head: args.branch ? `${args.owner}:${args.branch}` : undefined,
      per_page: 1,
    },
    enabled: !!args.branch,
    refetchInterval: POLL,
    refetchIntervalInBackground: false,
    staleTime: STALE,
    select: (r) => {
      const arr = extractToolJson<Record<string, unknown>[]>(r);
      if (!arr || !Array.isArray(arr) || arr.length === 0) return null;
      const p = arr[0]!;
      const base = p.base as Record<string, unknown> | undefined;
      const head = p.head as Record<string, unknown> | undefined;
      const user = p.user as Record<string, unknown> | undefined;
      return {
        number: (p.number as number) ?? 0,
        title: (p.title as string) ?? "",
        body: (p.body as string) ?? "",
        state: p.state === "closed" ? ("closed" as const) : ("open" as const),
        merged: (p.merged_at as string | null) != null,
        mergedAt: (p.merged_at as string | null) ?? null,
        base: (base?.ref as string) ?? "main",
        head: (head?.ref as string) ?? "",
        htmlUrl: (p.html_url as string) ?? "",
        author: (user?.login as string) ?? "",
      };
    },
  });
}

/**
 * Fetches the file list for a PR via github-mcp-server.
 *
 * The tool name varies between github-mcp-server builds — try the common
 * names in order: `get_pull_request_files`, `list_pull_request_files`.
 * If neither matches your server, adjust the `toolName` here.
 */
export function usePrFiles(
  args: RepoArgs & { prNumber: number | null | undefined },
) {
  const client = useMCPClient({
    connectionId: args.connectionId,
    orgId: args.orgId,
  });

  return useMCPToolCallQuery<PrFile[]>({
    client,
    toolName: "get_pull_request_files",
    toolArguments: {
      owner: args.owner,
      repo: args.repo,
      pull_number: args.prNumber ?? 0,
    },
    enabled: !!args.prNumber,
    refetchInterval: POLL,
    refetchIntervalInBackground: false,
    staleTime: STALE,
    select: (r) => {
      const arr = extractToolJson<Record<string, unknown>[]>(r);
      if (!Array.isArray(arr)) return [];
      return arr.map(
        (f): PrFile => ({
          filename: String(f.filename ?? ""),
          status: (f.status as PrFile["status"] | undefined) ?? "modified",
          additions: Number(f.additions ?? 0),
          deletions: Number(f.deletions ?? 0),
          blobUrl: typeof f.blob_url === "string" ? f.blob_url : null,
        }),
      );
    },
  });
}
