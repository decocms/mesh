import { Suspense } from "react";
import { Page } from "@/web/components/page";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { useInsetContext } from "@/web/layouts/agent-shell-layout";
import { usePanelActions } from "@/web/layouts/shell-layout";
import {
  useProjectContext,
  useMCPClient,
  useMCPToolCall,
  useVirtualMCP,
} from "@decocms/mesh-sdk";
import type { VirtualMCPEntity } from "@decocms/mesh-sdk/types";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  SchemaResolver,
  type FieldDescriptor,
  type SiteMeta,
} from "@/web/lib/schema-resolver";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  File06,
  LinkExternal01,
  RefreshCw01,
  SearchLg,
} from "@untitledui/icons";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getDecoConnectionId(
  entity: VirtualMCPEntity | null,
): string | null {
  if (!entity) return null;
  const pinnedViews = (
    entity.metadata?.ui as Record<string, unknown> | null | undefined
  )?.pinnedViews as
    | Array<{ connectionId: string; toolName: string }>
    | null
    | undefined;
  return (
    pinnedViews?.find((v) => v.toolName === "file_explorer")?.connectionId ??
    null
  );
}

function extractStructured<T>(result: CallToolResult): T | null {
  if (result.isError) return null;
  if (result.structuredContent) return result.structuredContent as T;
  const textBlock = result.content?.find(
    (b): b is { type: "text"; text: string } => b.type === "text",
  );
  if (textBlock?.text) {
    try {
      return JSON.parse(textBlock.text) as T;
    } catch {
      return null;
    }
  }
  return null;
}

function consistentHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileExplorerResult {
  site: string;
  userEnv: string;
  userEnvUrl: string | null;
  productionUrl: string;
}

type Decofile = Record<string, Record<string, unknown>>;

interface PageInfo {
  key: string;
  name: string;
  path: string;
}

// ---------------------------------------------------------------------------
// Shared data hooks — single source of truth for _meta and decofile
// ---------------------------------------------------------------------------

function buildEnvUrl(site: string, userEnv: string, userEnvUrl: string | null) {
  return (
    userEnvUrl ||
    `https://sites-${site}--${consistentHash(userEnv)}.decocdn.com`
  );
}

const DECOFILE_STALE = 60_000;
const META_STALE = 5 * 60 * 1000;

function useDecofile(envUrl: string) {
  return useSuspenseQuery<Decofile | null>({
    queryKey: ["decofile", envUrl],
    queryFn: async () => {
      const res = await fetch(`${envUrl}/.decofile`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: DECOFILE_STALE,
    retry: 1,
  });
}

function useSiteMeta(envUrl: string) {
  return useSuspenseQuery<SiteMeta>({
    queryKey: ["site-meta", envUrl],
    queryFn: async () => {
      const res = await fetch(`${envUrl}/live/_meta`);
      if (!res.ok) throw new Error(`Failed to fetch _meta (${res.status})`);
      return res.json();
    },
    staleTime: META_STALE,
    retry: 1,
  });
}

/**
 * Derive pages list from the decofile — same logic as get_pages MCP tool
 * but done client-side, no round-trip needed.
 */
function derivePagesFromDecofile(decofile: Decofile | null): PageInfo[] {
  if (!decofile) return [];
  return Object.entries(decofile)
    .filter(([, block]) => {
      if (!block?.path) return false;
      const rt = (block.__resolveType as string) ?? "";
      return rt.split("/").includes("pages");
    })
    .map(([id, block]) => ({
      key: id,
      name: String(block.name ?? id),
      path: String(block.path ?? "/"),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

// ---------------------------------------------------------------------------
// PagesView (entry point)
// ---------------------------------------------------------------------------

export default function PagesView({ pageKey }: { pageKey?: string }) {
  const { virtualMcpId } = useInsetContext()!;
  const entity = useVirtualMCP(virtualMcpId);
  const connectionId = getDecoConnectionId(entity);

  if (!connectionId) {
    return (
      <Page>
        <Page.Content>
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">
              No deco.cx connection found for this project.
            </p>
          </div>
        </Page.Content>
      </Page>
    );
  }

  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <Page>
            <Page.Content>
              <div className="flex items-center justify-center h-full">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Loading pages...</span>
                </div>
              </div>
            </Page.Content>
          </Page>
        }
      >
        <PagesViewInner connectionId={connectionId} pageKey={pageKey} />
      </Suspense>
    </ErrorBoundary>
  );
}

// ---------------------------------------------------------------------------
// Inner — bootstraps env, fetches decofile once, then branches
// ---------------------------------------------------------------------------

function PagesViewInner({
  connectionId,
  pageKey,
}: {
  connectionId: string;
  pageKey?: string;
}) {
  const { org } = useProjectContext();
  const client = useMCPClient({ connectionId, orgId: org.id });

  const { data: envResult } = useMCPToolCall({
    client,
    toolName: "file_explorer",
    toolArguments: {},
    staleTime: 5 * 60 * 1000,
  });

  const env = extractStructured<FileExplorerResult>(envResult);
  if (!env?.userEnv) {
    return (
      <Page>
        <Page.Content>
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">
              Could not initialize sandbox environment.
            </p>
          </div>
        </Page.Content>
      </Page>
    );
  }

  const envUrl = buildEnvUrl(env.site, env.userEnv, env.userEnvUrl);

  if (pageKey) {
    return (
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading preview...</span>
            </div>
          </div>
        }
      >
        <PagePreviewView envUrl={envUrl} pageKey={pageKey} />
      </Suspense>
    );
  }

  return (
    <Suspense
      fallback={
        <Page>
          <Page.Content>
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Loading pages...</span>
              </div>
            </div>
          </Page.Content>
        </Page>
      }
    >
      <PagesListView envUrl={envUrl} />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Pages List — derives page list from the decofile (no MCP call)
// ---------------------------------------------------------------------------

function PagesListView({ envUrl }: { envUrl: string }) {
  const { openMainView } = usePanelActions();
  const [search, setSearch] = useState("");

  const { data: decofile } = useDecofile(envUrl);
  const allPages = derivePagesFromDecofile(decofile);

  const query = search.trim().toLowerCase();
  const pages = query
    ? allPages.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.path.toLowerCase().includes(query),
      )
    : allPages;

  return (
    <Page>
      <Page.Header>
        <Page.Header.Left>
          <File06 size={16} className="text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">Pages</span>
          <span className="text-xs text-muted-foreground">
            {allPages.length} {allPages.length === 1 ? "page" : "pages"}
          </span>
        </Page.Header.Left>
      </Page.Header>
      <Page.Content>
        {allPages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">
              No pages found in this environment.
            </p>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="px-4 py-2 border-b border-border/50">
              <div className="relative">
                <SearchLg
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
                <Input
                  placeholder="Search pages..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>
            {pages.length === 0 ? (
              <div className="flex items-center justify-center flex-1 py-12">
                <p className="text-sm text-muted-foreground">
                  No pages matching &quot;{search}&quot;
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/50 overflow-auto flex-1">
                {pages.map((page) => (
                  <button
                    key={page.key}
                    type="button"
                    onClick={() => openMainView("pages", { id: page.key })}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors"
                  >
                    <File06
                      size={14}
                      className="text-muted-foreground shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {page.name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {page.path}
                      </div>
                    </div>
                    <ChevronRight
                      size={14}
                      className="text-muted-foreground shrink-0"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Page.Content>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// PageSectionsPanel — rendered inside the thick sidebar
// ---------------------------------------------------------------------------

/**
 * Renders sections list for a page. Used by PageSectionsSidebar.
 * Fetches _meta + decofile via shared hooks (cached, no duplication).
 */
export function PageSectionsPanel({
  envUrl,
  pageKey,
}: {
  envUrl: string;
  pageKey: string;
}) {
  const { openMainView } = usePanelActions();

  const { data: meta } = useSiteMeta(envUrl);
  const { data: decofile } = useDecofile(envUrl);

  const resolver = meta ? new SchemaResolver(meta) : null;
  const pageContent = decofile?.[pageKey] ?? null;
  const pageName =
    (pageContent?.name as string) ?? (pageContent?.title as string) ?? pageKey;

  const sections = (pageContent?.sections ?? []) as Array<{
    __resolveType: string;
    [k: string]: unknown;
  }>;

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center gap-1.5 px-3 h-11 border-b border-border/50">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openMainView("pages")}
          className="gap-1.5 -ml-1"
        >
          <ArrowLeft size={14} />
          Pages
        </Button>
        <span className="text-muted-foreground text-xs">/</span>
        <span className="text-sm font-medium truncate">{pageName}</span>
      </div>

      <div className="flex-1 overflow-auto">
        {!resolver ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-xs text-muted-foreground">
              Could not load site schema.
            </p>
          </div>
        ) : sections.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-xs text-muted-foreground">No sections found.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {sections.map((section, idx) => (
              <SectionSchemaCard
                key={`${section.__resolveType}-${idx}`}
                resolveType={section.__resolveType}
                resolver={resolver}
                index={idx}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PageSectionsSidebar — bootstraps env then renders sections panel
// ---------------------------------------------------------------------------

export function PageSectionsSidebar({
  connectionId,
  pageKey,
}: {
  connectionId: string;
  pageKey: string;
}) {
  const { org } = useProjectContext();
  const client = useMCPClient({ connectionId, orgId: org.id });

  const { data: envResult } = useMCPToolCall({
    client,
    toolName: "file_explorer",
    toolArguments: {},
    staleTime: 5 * 60 * 1000,
  });

  const env = extractStructured<FileExplorerResult>(envResult);
  if (!env?.userEnv) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-xs text-muted-foreground">
          Initializing environment...
        </p>
      </div>
    );
  }

  const envUrl = buildEnvUrl(env.site, env.userEnv, env.userEnvUrl);

  return <PageSectionsPanel envUrl={envUrl} pageKey={pageKey} />;
}

// ---------------------------------------------------------------------------
// PagePreviewView — iframe + URL bar (main content area)
// ---------------------------------------------------------------------------

function PagePreviewView({
  envUrl,
  pageKey,
}: {
  envUrl: string;
  pageKey: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const { data: decofile } = useDecofile(envUrl);
  const initialPath = (decofile?.[pageKey]?.path as string) ?? "/";

  const [previewPath, setPreviewPath] = useState(initialPath);
  const [pathInput, setPathInput] = useState(initialPath);
  const [refreshKey, setRefreshKey] = useState(0);

  const previewSrc = `${envUrl}${previewPath}`;

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = pathInput.startsWith("/") ? pathInput : `/${pathInput}`;
    setPreviewPath(normalized);
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 px-3 h-11 border-b border-border/50">
        <form onSubmit={handlePathSubmit} className="flex-1 min-w-0">
          <div className="flex h-8 items-center gap-1.5 rounded-lg border bg-muted/30 px-1">
            <Input
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              placeholder="/"
              className="h-7 min-w-0 flex-1 border-0 bg-transparent px-1.5 shadow-none focus-visible:ring-0 text-sm"
            />
          </div>
        </form>
        <button
          type="button"
          onClick={() => window.open(previewSrc, "_blank")}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Open in new tab"
        >
          <LinkExternal01 size={14} />
        </button>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Refresh preview"
        >
          <RefreshCw01 size={14} />
        </button>
      </div>

      <div className="flex-1 min-h-0 bg-muted/20">
        <iframe
          key={`${previewSrc}-${refreshKey}`}
          ref={iframeRef}
          src={previewSrc}
          title={`Preview of ${previewPath}`}
          className="h-full w-full border-0"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Schema Card
// ---------------------------------------------------------------------------

function SectionSchemaCard({
  resolveType,
  resolver,
  index,
}: {
  resolveType: string;
  resolver: SchemaResolver;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const descriptor = resolver.resolveSection(resolveType);

  const sectionName =
    resolveType
      .split("/")
      .pop()
      ?.replace(/\.tsx?$/, "") ?? resolveType;

  return (
    <div className="px-4 py-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 text-left"
      >
        {expanded ? (
          <ChevronDown size={14} className="text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-muted-foreground shrink-0" />
        )}
        <span className="text-xs font-mono text-muted-foreground w-6 shrink-0">
          #{index + 1}
        </span>
        <span className="text-sm font-medium truncate">{sectionName}</span>
        <span className="text-xs text-muted-foreground truncate ml-auto">
          {resolveType}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 ml-8 border-l border-border/50 pl-4">
          {descriptor ? (
            <FieldDescriptorTree descriptor={descriptor} depth={0} />
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Schema not found for this section.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field Descriptor Tree (read-only display)
// ---------------------------------------------------------------------------

const TYPE_COLORS: Record<string, string> = {
  string: "text-green-600 dark:text-green-400",
  number: "text-blue-600 dark:text-blue-400",
  boolean: "text-amber-600 dark:text-amber-400",
  object: "text-purple-600 dark:text-purple-400",
  array: "text-cyan-600 dark:text-cyan-400",
  union: "text-pink-600 dark:text-pink-400",
  unknown: "text-muted-foreground",
};

function FieldDescriptorTree({
  descriptor,
  depth,
}: {
  descriptor: FieldDescriptor;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren =
    (descriptor.properties && descriptor.properties.length > 0) ||
    descriptor.itemDescriptor ||
    (descriptor.variants && descriptor.variants.length > 0);

  const typeLabel =
    descriptor.type === "array" && descriptor.itemDescriptor
      ? `${descriptor.itemDescriptor.type}[]`
      : descriptor.type;

  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => hasChildren && setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-1.5 py-0.5 w-full text-left",
          hasChildren && "cursor-pointer hover:bg-accent/30 rounded -mx-1 px-1",
          !hasChildren && "cursor-default",
        )}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown size={12} className="text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight
              size={12}
              className="text-muted-foreground shrink-0"
            />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <span className="font-mono font-medium">{descriptor.key}</span>
        <span className={cn("font-mono", TYPE_COLORS[descriptor.type])}>
          {typeLabel}
        </span>
        {descriptor.nullable && (
          <span className="text-muted-foreground">| null</span>
        )}
        {descriptor.required && (
          <span className="text-red-500 dark:text-red-400">*</span>
        )}
        {descriptor.format && (
          <span className="text-muted-foreground bg-muted px-1 rounded">
            {descriptor.format}
          </span>
        )}
        {descriptor.enumValues && (
          <span className="text-muted-foreground">
            [{descriptor.enumValues.join(" | ")}]
          </span>
        )}
      </button>

      {expanded && hasChildren && (
        <div className="ml-4 border-l border-border/30 pl-2 mt-0.5">
          {descriptor.properties?.map((prop) => (
            <FieldDescriptorTree
              key={prop.key}
              descriptor={prop}
              depth={depth + 1}
            />
          ))}
          {descriptor.itemDescriptor && (
            <FieldDescriptorTree
              descriptor={descriptor.itemDescriptor}
              depth={depth + 1}
            />
          )}
          {descriptor.variants?.map((variant) => (
            <div key={variant.resolveType} className="mt-1">
              <span className="text-muted-foreground font-mono text-[10px]">
                variant: {variant.title}
              </span>
              <div className="ml-2">
                <FieldDescriptorTree
                  descriptor={variant.schema}
                  depth={depth + 1}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
