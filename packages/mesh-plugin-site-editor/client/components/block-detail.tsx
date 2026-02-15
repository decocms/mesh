/**
 * Block Detail Component
 *
 * Shows block metadata and an @rjsf prop editor form.
 * Uses SITE_BINDING tools via block-api helpers.
 * Local formData state only -- Phase 3 will wire saves to page block instances.
 */

import { useRef, useState } from "react";
import { SITE_BINDING } from "@decocms/bindings/site";
import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@deco/ui/components/button.tsx";
import { Badge } from "@deco/ui/components/badge.tsx";
import { ArrowLeft, Loading01, AlertCircle } from "@untitledui/icons";
import { ChevronDown, ChevronRight } from "lucide-react";
import { blockKeys } from "../lib/query-keys";
import { siteEditorRouter } from "../lib/router";
import { getBlock } from "../lib/block-api";
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

export default function BlockDetail() {
  const { toolCaller, connectionId } = usePluginContext<typeof SITE_BINDING>();
  const navigate = siteEditorRouter.useNavigate();
  const { blockId } = siteEditorRouter.useParams({
    from: "/site-editor-layout/sections/$blockId",
  });

  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [schemaExpanded, setSchemaExpanded] = useState(false);
  const lastSyncedBlockId = useRef<string | null>(null);

  const {
    data: block,
    isLoading,
    error,
  } = useQuery({
    queryKey: blockKeys.detail(connectionId, blockId),
    queryFn: () => getBlock(toolCaller, blockId),
  });

  // Sync formData when block data loads (ref-based, not useEffect)
  if (block && lastSyncedBlockId.current !== block.id) {
    lastSyncedBlockId.current = block.id;
    setFormData(block.defaults ?? {});
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <Loading01
          size={32}
          className="animate-spin text-muted-foreground mb-4"
        />
        <p className="text-sm text-muted-foreground">Loading block...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <AlertCircle size={48} className="text-destructive mb-4" />
        <h3 className="text-lg font-medium mb-2">Error loading block</h3>
        <p className="text-muted-foreground text-center">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </div>
    );
  }

  if (!block) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <AlertCircle size={48} className="text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">Block not found</h3>
        <p className="text-muted-foreground text-center mb-4">
          The block "{blockId}" could not be found.
        </p>
        <Button
          variant="outline"
          onClick={() => navigate({ to: "/site-editor-layout/sections" })}
        >
          <ArrowLeft size={14} className="mr-1" />
          Back to Sections
        </Button>
      </div>
    );
  }

  const propsCount = Object.keys(block.schema?.properties ?? {}).length;
  const hasSchema =
    block.schema &&
    typeof block.schema === "object" &&
    Object.keys(block.schema).length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header with breadcrumb */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => navigate({ to: "/site-editor-layout/sections" })}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Sections
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{block.label}</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl space-y-6">
          {/* Block info */}
          <div>
            <h2 className="text-xl font-semibold">{block.label}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {block.component}
            </p>
            {block.description && (
              <p className="text-sm text-muted-foreground mt-2">
                {block.description}
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
                    {scanMethodLabel(block.metadata.scanMethod)}
                  </Badge>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Scanned</span>
                <p className="mt-0.5">
                  {formatTimestamp(block.metadata.scannedAt)}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Props Type</span>
                <p className="font-mono text-xs mt-0.5">
                  {block.metadata.propsTypeName ?? "unknown"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Properties</span>
                <p className="mt-0.5">{propsCount} props</p>
              </div>
            </div>
          </div>

          {/* Raw schema (collapsible) */}
          {hasSchema && (
            <div className="border border-border rounded-lg">
              <button
                type="button"
                onClick={() => setSchemaExpanded(!schemaExpanded)}
                className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {schemaExpanded ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
                Raw JSON Schema
              </button>
              {schemaExpanded && (
                <div className="border-t border-border px-4 py-3">
                  <pre className="text-xs font-mono overflow-x-auto bg-muted/30 rounded p-3 max-h-80 overflow-y-auto">
                    {JSON.stringify(block.schema, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Props editor */}
          {hasSchema ? (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Props Editor</h3>
              <div className="border border-border rounded-lg p-4">
                <PropEditor
                  schema={block.schema as any}
                  formData={formData}
                  onChange={setFormData}
                />
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No schema available for this block.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
