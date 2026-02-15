/**
 * Loader Detail Component
 *
 * Shows loader metadata, output schema, and an @rjsf prop editor for input parameters.
 * Uses SITE_BINDING tools via loader-api helpers.
 * This is a browsing/exploration view -- actual parameter configuration happens
 * when binding a loader to a section prop via the loader picker.
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
import { getLoader } from "../lib/loader-api";
import { PropEditor } from "./prop-editor";

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
  const [outputSchemaExpanded, setOutputSchemaExpanded] = useState(false);
  const [inputSchemaExpanded, setInputSchemaExpanded] = useState(false);
  const lastSyncedLoaderId = useRef<string | null>(null);

  const {
    data: loader,
    isLoading,
    error,
  } = useQuery({
    queryKey: loaderKeys.detail(connectionId, loaderId),
    queryFn: () => getLoader(toolCaller, loaderId),
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
  const hasInputSchema =
    loader.inputSchema &&
    typeof loader.inputSchema === "object" &&
    Object.keys(loader.inputSchema).length > 0;
  const hasOutputSchema =
    loader.outputSchema &&
    typeof loader.outputSchema === "object" &&
    Object.keys(loader.outputSchema).length > 0;

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
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl space-y-6">
          {/* Loader info */}
          <div>
            <h2 className="text-xl font-semibold">{loader.label}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {loader.source}
            </p>
            {loader.description && (
              <p className="text-sm text-muted-foreground mt-2">
                {loader.description}
              </p>
            )}
          </div>

          {/* Metadata section */}
          <div className="border border-border rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              Metadata
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Scan Method</span>
                <div className="mt-0.5">
                  <Badge variant="secondary" className="text-xs">
                    {scanMethodLabel(loader.metadata.scanMethod)}
                  </Badge>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Scanned</span>
                <p className="mt-0.5">
                  {formatTimestamp(loader.metadata.scannedAt)}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Props Type</span>
                <p className="font-mono text-xs mt-0.5">
                  {loader.metadata.propsTypeName ?? "none"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Return Type</span>
                <p className="font-mono text-xs mt-0.5">
                  {loader.metadata.returnTypeName ?? "unknown"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Input Params</span>
                <p className="mt-0.5">{inputParamsCount} params</p>
              </div>
            </div>
          </div>

          {/* Output schema (collapsible) */}
          {hasOutputSchema && (
            <div className="border border-border rounded-lg">
              <button
                type="button"
                onClick={() => setOutputSchemaExpanded(!outputSchemaExpanded)}
                className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {outputSchemaExpanded ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
                Output Schema
              </button>
              {outputSchemaExpanded && (
                <div className="border-t border-border px-4 py-3">
                  <pre className="text-xs font-mono overflow-x-auto bg-muted/30 rounded p-3 max-h-80 overflow-y-auto">
                    {JSON.stringify(loader.outputSchema, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Input schema raw view (collapsible) */}
          {hasInputSchema && (
            <div className="border border-border rounded-lg">
              <button
                type="button"
                onClick={() => setInputSchemaExpanded(!inputSchemaExpanded)}
                className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {inputSchemaExpanded ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
                Raw Input Schema
              </button>
              {inputSchemaExpanded && (
                <div className="border-t border-border px-4 py-3">
                  <pre className="text-xs font-mono overflow-x-auto bg-muted/30 rounded p-3 max-h-80 overflow-y-auto">
                    {JSON.stringify(loader.inputSchema, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Input Parameters editor */}
          {hasInputSchema && inputParamsCount > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Input Parameters</h3>
              <div className="border border-border rounded-lg p-4">
                <PropEditor
                  schema={loader.inputSchema as any}
                  formData={formData}
                  onChange={setFormData}
                />
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              This loader has no input parameters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
