/**
 * Loader Detail Component
 *
 * Two-column layout: output schema tree on left, readonly prop editor on right.
 * Uses SITE_BINDING tools via loader-api helpers.
 * Shows connected sections as an expandable badge in the metadata bar.
 */

import { useRef, useState } from "react";
import { SITE_BINDING } from "@decocms/bindings/site";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@deco/ui/components/button.tsx";
import { Badge } from "@deco/ui/components/badge.tsx";
import { ArrowLeft, Loading01, AlertCircle } from "@untitledui/icons";
import { ChevronDown, ChevronRight } from "lucide-react";
import { loaderKeys } from "../lib/query-keys";
import { siteEditorRouter } from "../lib/router";
import { getLoader, computeLoaderSectionMap } from "../lib/loader-api";
import { PropEditor } from "./prop-editor";
import SchemaTree from "./schema-tree";

function formatTimestamp(dateStr: string): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function scanMethodLabel(method: string): string {
  switch (method) {
    case "ts-morph":
      return "ts-morph";
    case "manual":
      return "Manual";
    case "ai-agent":
      return "AI Agent";
    default:
      return method;
  }
}

export default function LoaderDetail() {
  const { toolCaller, connectionId } = usePluginContext<typeof SITE_BINDING>();
  const navigate = siteEditorRouter.useNavigate();
  const { loaderId } = siteEditorRouter.useParams({
    from: "/site-editor-layout/loaders/$loaderId",
  });

  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [sectionsExpanded, setSectionsExpanded] = useState(false);
  const lastSyncedLoaderId = useRef<string | null>(null);

  const {
    data: loader,
    isLoading,
    error,
  } = useQuery({
    queryKey: loaderKeys.detail(connectionId, loaderId),
    queryFn: () => getLoader(toolCaller, loaderId),
  });

  const { data: connectedSections = [] } = useQuery({
    queryKey: loaderKeys.sectionMap(connectionId),
    queryFn: () => computeLoaderSectionMap(toolCaller),
    select: (map) => map.get(loaderId) ?? [],
  });

  // Sync formData when loader data loads (ref-based, not useEffect)
  if (loader && lastSyncedLoaderId.current !== loader.id) {
    lastSyncedLoaderId.current = loader.id;
    setFormData(loader.defaults ?? {});
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <Loading01
          size={32}
          className="animate-spin text-muted-foreground mb-4"
        />
        <p className="text-sm text-muted-foreground">Loading loader...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <AlertCircle size={48} className="text-destructive mb-4" />
        <h3 className="text-lg font-medium mb-2">Error loading loader</h3>
        <p className="text-muted-foreground text-center">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </div>
    );
  }

  if (!loader) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <AlertCircle size={48} className="text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">Loader not found</h3>
        <p className="text-muted-foreground text-center mb-4">
          The loader &quot;{loaderId}&quot; could not be found.
        </p>
        <Button
          variant="outline"
          onClick={() => navigate({ to: "/site-editor-layout/loaders" })}
        >
          <ArrowLeft size={14} className="mr-1" />
          Back to Loaders
        </Button>
      </div>
    );
  }

  const inputParamsCount = Object.keys(
    loader.inputSchema?.properties ?? {},
  ).length;
  const hasOutputSchema =
    loader.outputSchema &&
    typeof loader.outputSchema === "object" &&
    Object.keys(loader.outputSchema).length > 0;
  const hasValidOutputSchema =
    hasOutputSchema &&
    (loader.outputSchema as Record<string, unknown>).type === "object" &&
    (loader.outputSchema as Record<string, unknown>).properties;
  const hasInputSchema =
    loader.inputSchema &&
    typeof loader.inputSchema === "object" &&
    Object.keys(loader.inputSchema).length > 0;
  const hasValidInputSchema =
    hasInputSchema &&
    (loader.inputSchema as Record<string, unknown>).type === "object" &&
    (loader.inputSchema as Record<string, unknown>).properties;

  return (
    <div className="flex flex-col h-full">
      {/* Header with breadcrumb */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => navigate({ to: "/site-editor-layout/loaders" })}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Loaders
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{loader.label}</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {/* Loader info bar -- spans full width */}
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-xl font-semibold">{loader.label}</h2>
          <p className="text-sm text-muted-foreground mt-1">{loader.source}</p>
          {loader.description && (
            <p className="text-sm text-muted-foreground mt-2">
              {loader.description}
            </p>
          )}
          {/* Metadata inline */}
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <Badge variant="secondary" className="text-xs">
              {scanMethodLabel(loader.metadata.scanMethod)}
            </Badge>
            <span>Scanned {formatTimestamp(loader.metadata.scannedAt)}</span>
            {loader.metadata.propsTypeName && (
              <span className="font-mono">{loader.metadata.propsTypeName}</span>
            )}
            {loader.metadata.returnTypeName && (
              <span className="font-mono">
                {loader.metadata.returnTypeName}
              </span>
            )}
            <span>{inputParamsCount} params</span>
            <button
              type="button"
              onClick={() => setSectionsExpanded(!sectionsExpanded)}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <Badge variant="secondary" className="text-xs">
                {connectedSections.length} sections
              </Badge>
              {sectionsExpanded ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )}
            </button>
          </div>
          {sectionsExpanded && connectedSections.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {connectedSections.map((name) => (
                <Badge key={name} variant="outline" className="text-xs">
                  {name}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 h-[calc(100%-7rem)] divide-x divide-border">
          {/* Left column: Output Schema */}
          <div className="overflow-y-auto p-4">
            <h3 className="text-sm font-medium mb-3">Output Schema</h3>
            {hasValidOutputSchema ? (
              <SchemaTree
                schema={loader.outputSchema as Record<string, unknown>}
              />
            ) : hasOutputSchema ? (
              <div>
                <p className="text-sm text-amber-600 mb-2">
                  Schema could not be rendered as a tree. Showing raw JSON.
                </p>
                <pre className="text-xs font-mono bg-muted/30 rounded p-3 max-h-80 overflow-auto">
                  {JSON.stringify(loader.outputSchema, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No output schema available for this loader.
              </p>
            )}
          </div>

          {/* Right column: Input Parameters */}
          <div className="overflow-y-auto p-4">
            <h3 className="text-sm font-medium mb-3">Input Parameters</h3>
            {hasValidInputSchema && inputParamsCount > 0 ? (
              <PropEditor
                schema={loader.inputSchema as any}
                formData={formData}
                onChange={setFormData}
                readonly
              />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                This loader has no input parameters.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
