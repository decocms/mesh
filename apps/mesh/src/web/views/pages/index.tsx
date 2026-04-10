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
  unwrapSection,
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
import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Label } from "@deco/ui/components/label.tsx";
import { Switch } from "@deco/ui/components/switch.tsx";
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
                sectionData={section}
                decofile={decofile}
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
  sectionData,
  decofile,
  resolver,
  index,
}: {
  sectionData: { __resolveType: string; [k: string]: unknown };
  decofile: Decofile | null;
  resolver: SchemaResolver;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const { resolveType, isLazy } = unwrapSection(sectionData, decofile);
  const descriptor = resolver.resolveSectionWithDecofile(resolveType, decofile);

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
        {isLazy && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            Async
          </Badge>
        )}
      </button>

      {expanded && (
        <div className="mt-3 ml-8 border-l border-border/50 pl-4">
          {descriptor ? (
            <ReadonlyFieldRenderer descriptor={descriptor} depth={0} />
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
// Readonly Field Renderer — renders actual form inputs from FieldDescriptors
// ---------------------------------------------------------------------------

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function FieldLabel({ descriptor }: { descriptor: FieldDescriptor }) {
  const label = descriptor.title || humanizeKey(descriptor.key);
  return (
    <div className="flex items-center gap-1.5 mb-1">
      <Label className="text-xs font-medium">{label}</Label>
      {!descriptor.required && (
        <span className="text-[10px] text-muted-foreground">(optional)</span>
      )}
    </div>
  );
}

function FieldDescription({ text }: { text?: string }) {
  if (!text) return null;
  return <p className="text-[11px] text-muted-foreground mt-0.5">{text}</p>;
}

function ReadonlyFieldRenderer({
  descriptor,
  depth,
}: {
  descriptor: FieldDescriptor;
  depth: number;
}) {
  switch (descriptor.type) {
    case "string":
      return <StringField descriptor={descriptor} />;
    case "number":
      return <NumberField descriptor={descriptor} />;
    case "boolean":
      return <BooleanField descriptor={descriptor} />;
    case "object":
      return <ObjectField descriptor={descriptor} depth={depth} />;
    case "array":
      return <ArrayField descriptor={descriptor} depth={depth} />;
    case "union":
      return <UnionField descriptor={descriptor} depth={depth} />;
    default:
      return (
        <div className="py-1.5">
          <FieldLabel descriptor={descriptor} />
          <Input readOnly className="h-8 text-xs bg-muted/30" placeholder="—" />
        </div>
      );
  }
}

function StringField({ descriptor }: { descriptor: FieldDescriptor }) {
  if (descriptor.enumValues && descriptor.enumValues.length > 0) {
    return (
      <div className="py-1.5">
        <FieldLabel descriptor={descriptor} />
        <div className="flex flex-wrap gap-1">
          {descriptor.enumValues.map((val) => (
            <Badge key={val} variant="outline" className="text-[10px]">
              {val}
            </Badge>
          ))}
        </div>
        <FieldDescription text={descriptor.description} />
      </div>
    );
  }

  return (
    <div className="py-1.5">
      <FieldLabel descriptor={descriptor} />
      <Input
        readOnly
        className="h-8 text-xs bg-muted/30"
        placeholder={descriptor.format ? `(${descriptor.format})` : "—"}
      />
      {descriptor.format && (
        <span className="text-[10px] text-muted-foreground mt-0.5 block">
          Format: {descriptor.format}
        </span>
      )}
      <FieldDescription text={descriptor.description} />
    </div>
  );
}

function NumberField({ descriptor }: { descriptor: FieldDescriptor }) {
  return (
    <div className="py-1.5">
      <FieldLabel descriptor={descriptor} />
      <Input
        readOnly
        type="number"
        className="h-8 text-xs bg-muted/30"
        placeholder="—"
      />
      <FieldDescription text={descriptor.description} />
    </div>
  );
}

function BooleanField({ descriptor }: { descriptor: FieldDescriptor }) {
  const label = descriptor.title || humanizeKey(descriptor.key);
  return (
    <div className="py-1.5 flex items-center justify-between gap-2">
      <div className="flex-1 min-w-0">
        <Label className="text-xs font-medium">{label}</Label>
        {descriptor.description && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {descriptor.description}
          </p>
        )}
      </div>
      <Switch disabled checked={false} className="shrink-0" />
    </div>
  );
}

function ObjectField({
  descriptor,
  depth,
}: {
  descriptor: FieldDescriptor;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const props = descriptor.properties ?? [];

  if (props.length === 0) {
    return (
      <div className="py-1.5">
        <FieldLabel descriptor={descriptor} />
        <p className="text-[11px] text-muted-foreground italic">Empty object</p>
      </div>
    );
  }

  return (
    <div className="py-1.5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 text-left"
      >
        {expanded ? (
          <ChevronDown size={12} className="text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-muted-foreground shrink-0" />
        )}
        <Label className="text-xs font-medium cursor-pointer">
          {descriptor.title || humanizeKey(descriptor.key)}
        </Label>
        <span className="text-[10px] text-muted-foreground">
          {props.length} {props.length === 1 ? "field" : "fields"}
        </span>
      </button>
      {expanded && (
        <div className="ml-3 mt-1 border-l border-border/40 pl-3 space-y-0.5">
          {props.map((prop) => (
            <ReadonlyFieldRenderer
              key={prop.key}
              descriptor={prop}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ArrayField({
  descriptor,
  depth,
}: {
  descriptor: FieldDescriptor;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const itemDescriptor = descriptor.itemDescriptor;

  return (
    <div className="py-1.5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 text-left"
      >
        {expanded ? (
          <ChevronDown size={12} className="text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-muted-foreground shrink-0" />
        )}
        <Label className="text-xs font-medium cursor-pointer">
          {descriptor.title || humanizeKey(descriptor.key)}
        </Label>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {itemDescriptor?.type ?? "item"}[]
        </Badge>
      </button>
      {expanded && itemDescriptor && (
        <div className="ml-3 mt-1 border-l border-border/40 pl-3">
          <ReadonlyFieldRenderer
            descriptor={itemDescriptor}
            depth={depth + 1}
          />
        </div>
      )}
      <FieldDescription text={descriptor.description} />
    </div>
  );
}

function UnionField({
  descriptor,
  depth,
}: {
  descriptor: FieldDescriptor;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const variants = descriptor.variants ?? [];

  return (
    <div className="py-1.5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 text-left"
      >
        {expanded ? (
          <ChevronDown size={12} className="text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-muted-foreground shrink-0" />
        )}
        <Label className="text-xs font-medium cursor-pointer">
          {descriptor.title || humanizeKey(descriptor.key)}
        </Label>
        <span className="text-[10px] text-muted-foreground">
          {variants.length} {variants.length === 1 ? "variant" : "variants"}
        </span>
      </button>
      {expanded && variants.length > 0 && (
        <div className="ml-3 mt-1 space-y-2">
          {variants.map((variant) => {
            const variantName =
              variant.title ||
              variant.resolveType
                .split("/")
                .pop()
                ?.replace(/\.tsx?$/, "") ||
              variant.resolveType;
            return (
              <div
                key={variant.resolveType}
                className="border border-border/40 rounded-md p-2"
              >
                <Badge variant="outline" className="text-[10px] mb-1.5">
                  {variantName}
                </Badge>
                <div className="pl-1 space-y-0.5">
                  <ReadonlyFieldRenderer
                    descriptor={variant.schema}
                    depth={depth + 1}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <FieldDescription text={descriptor.description} />
    </div>
  );
}
