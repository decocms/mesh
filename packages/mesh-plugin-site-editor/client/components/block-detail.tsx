/**
 * Block Detail Component
 *
 * Two-column layout: schema tree on left, prop editor on right.
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
import { blockKeys } from "../lib/query-keys";
import { siteEditorRouter } from "../lib/router";
import { getBlock } from "../lib/block-api";
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

export default function BlockDetail() {
  const { toolCaller, connectionId } = usePluginContext<typeof SITE_BINDING>();
  const navigate = siteEditorRouter.useNavigate();
  const { blockId } = siteEditorRouter.useParams({
    from: "/site-editor-layout/sections/$blockId",
  });

  const [formData, setFormData] = useState<Record<string, unknown>>({});
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
  const hasValidSchema =
    hasSchema && block.schema.type === "object" && block.schema.properties;

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
      <div className="flex-1 overflow-hidden">
        {/* Block info bar -- spans full width */}
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-xl font-semibold">{block.label}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {block.component}
          </p>
          {block.description && (
            <p className="text-sm text-muted-foreground mt-2">
              {block.description}
            </p>
          )}
          {/* Metadata inline */}
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            {block.metadata?.scanMethod && (
              <Badge variant="secondary" className="text-xs">
                {scanMethodLabel(block.metadata.scanMethod)}
              </Badge>
            )}
            {block.metadata?.scannedAt && (
              <span>Scanned {formatTimestamp(block.metadata.scannedAt)}</span>
            )}
            {block.metadata?.propsTypeName && (
              <span className="font-mono">{block.metadata.propsTypeName}</span>
            )}
            <span>{propsCount} props</span>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 h-[calc(100%-7rem)] divide-x divide-border">
          {/* Left column: Schema tree */}
          <div className="overflow-y-auto p-4">
            <h3 className="text-sm font-medium mb-3">Schema</h3>
            {hasValidSchema ? (
              <SchemaTree schema={block.schema as Record<string, unknown>} />
            ) : (
              <div>
                <p className="text-sm text-amber-600 mb-2">
                  Schema could not be rendered as a tree. Showing raw JSON.
                </p>
                <pre className="text-xs font-mono bg-muted/30 rounded p-3 max-h-80 overflow-auto">
                  {JSON.stringify(block.schema, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Right column: Prop editor */}
          <div className="overflow-y-auto p-4">
            <h3 className="text-sm font-medium mb-3">Props Editor</h3>
            {hasValidSchema ? (
              <PropEditor
                schema={block.schema as any}
                formData={formData}
                onChange={setFormData}
              />
            ) : hasSchema ? (
              <div>
                <p className="text-sm text-amber-600 mb-2">
                  Schema could not be rendered as a form. Showing raw JSON.
                </p>
                <pre className="text-xs font-mono bg-muted/30 rounded p-3 max-h-80 overflow-auto">
                  {JSON.stringify(block.schema, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No schema available for this block.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
