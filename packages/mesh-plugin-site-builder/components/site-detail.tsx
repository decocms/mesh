/**
 * Site Detail Component
 *
 * Shows site preview placeholder with info bar.
 * Future: Will embed live Deco preview.
 */

import { useSiteDetection } from "../hooks/use-site-detection";
import { usePluginContext } from "@decocms/bindings/plugins";
import { SITE_BUILDER_BINDING } from "../lib/binding";
import { useParams } from "@tanstack/react-router";
import {
  AlertCircle,
  Eye,
  Code,
  Layers,
  ExternalLink,
} from "@untitledui/icons";

export default function SiteDetail() {
  const { connectionId: paramConnectionId } = useParams({ strict: false });
  const { connectionId, connection } =
    usePluginContext<typeof SITE_BUILDER_BINDING>();
  const { data: detection, isLoading } = useSiteDetection();

  // Use connection from context if params doesn't match (route param might be different)
  const activeConnectionId = paramConnectionId || connectionId;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-muted-foreground">
          Loading site information...
        </div>
      </div>
    );
  }

  if (!detection?.isDeco) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <AlertCircle size={32} className="text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Not a Deco Site</h3>
        <p className="text-muted-foreground max-w-md">
          This connection does not appear to be a valid Deco site. Please ensure
          you have connected a folder with a{" "}
          <code className="bg-muted px-1 rounded">deno.json</code> file
          containing deco/ imports.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Info Bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {connection?.icon ? (
              <img src={connection.icon} alt="" className="size-5 rounded" />
            ) : null}
            <span className="text-sm font-medium">{connection?.title}</span>
            <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded bg-green-500/10 text-green-600 dark:text-green-400">
              Deco Site
            </span>
          </div>

          <div className="h-4 w-px bg-border" />

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Layers size={14} />
            <span>{detection.decoImports.length} deco imports</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-accent transition-colors"
          >
            <Code size={14} />
            Components
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-accent transition-colors"
          >
            <Eye size={14} />
            Preview
          </button>
        </div>
      </div>

      {/* Preview Placeholder */}
      <div className="flex-1 flex items-center justify-center bg-muted/10">
        <div className="text-center space-y-4 max-w-md p-8">
          <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
            <Eye size={40} className="text-muted-foreground" />
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-2">Live Preview</h3>
            <p className="text-sm text-muted-foreground mb-4">
              This area will display your Deco site with live preview and
              AI-assisted editing capabilities.
            </p>
          </div>

          <div className="bg-card rounded-lg border border-border p-4 text-left space-y-3">
            <p className="text-xs font-medium text-muted-foreground">
              Coming soon:
            </p>
            <ul className="text-xs text-muted-foreground space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                <span>Live site preview with dev server integration</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                <span>AI-powered component editing and suggestions</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                <span>Visual page builder with drag-and-drop</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                <span>Real-time collaboration and version control</span>
              </li>
            </ul>
          </div>

          <a
            href={`https://deco.cx/docs`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            Learn more about Deco
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}
