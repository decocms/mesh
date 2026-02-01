/**
 * Site List Component
 *
 * Shows site detection result and getting started information.
 */

import { useSiteDetection } from "../hooks/use-site-detection";
import { usePluginContext } from "@decocms/bindings/plugins";
import { SITE_BUILDER_BINDING } from "../lib/binding";
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
} from "@untitledui/icons";
import { useNavigate } from "@tanstack/react-router";

export default function SiteList() {
  const { connectionId, connection } =
    usePluginContext<typeof SITE_BUILDER_BINDING>();
  const { data: detection, isLoading } = useSiteDetection();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-muted-foreground">
          Detecting site configuration...
        </div>
      </div>
    );
  }

  if (!detection) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-muted-foreground">
          Unable to detect site configuration
        </div>
      </div>
    );
  }

  const handleViewSite = () => {
    if (connectionId) {
      navigate({
        to: "/sites/$connectionId",
        params: { connectionId },
      });
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Detection Status */}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Site Detection</h2>
        <div className="bg-card rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-start gap-3">
            {detection.isDeco ? (
              <CheckCircle size={20} className="text-green-600 mt-0.5" />
            ) : detection.hasDenoJson ? (
              <AlertCircle size={20} className="text-yellow-600 mt-0.5" />
            ) : (
              <XCircle size={20} className="text-red-600 mt-0.5" />
            )}
            <div className="flex-1">
              <h3 className="font-medium">
                {detection.isDeco
                  ? "Deco Site Detected"
                  : detection.hasDenoJson
                    ? "Deno Project Detected"
                    : "Not a Deco Site"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {detection.isDeco
                  ? "This folder contains a valid Deco site with deco/ imports."
                  : detection.hasDenoJson
                    ? "This folder has deno.json but no deco/ imports."
                    : detection.error ||
                      "No deno.json file found in this directory."}
              </p>
            </div>
          </div>

          {detection.isDeco && detection.decoImports.length > 0 && (
            <div className="pt-3 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Detected Deco Imports:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {detection.decoImports.slice(0, 5).map((imp) => (
                  <code
                    key={imp}
                    className="text-xs bg-muted px-2 py-0.5 rounded"
                  >
                    {imp}
                  </code>
                ))}
                {detection.decoImports.length > 5 && (
                  <span className="text-xs text-muted-foreground">
                    +{detection.decoImports.length - 5} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Connection Info */}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Connection</h2>
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center gap-3">
            {connection?.icon ? (
              <img src={connection.icon} alt="" className="size-8 rounded" />
            ) : null}
            <div>
              <h3 className="font-medium">{connection?.title}</h3>
              <p className="text-sm text-muted-foreground">
                {connection?.description || "Local filesystem connection"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      {detection.isDeco && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">Getting Started</h2>
          <div className="bg-card rounded-lg border border-border p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Your Deco site is ready to use. Start building with AI-assisted
              editing and live preview.
            </p>
            <button
              type="button"
              onClick={handleViewSite}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              View Site Builder
              <ExternalLink size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Help for non-Deco projects */}
      {!detection.isDeco && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">How to Use This Plugin</h2>
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              This plugin is designed for Deco sites. To use it:
            </p>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside ml-2">
              <li>
                Create a new Deco site or clone an existing one with{" "}
                <code className="bg-muted px-1 rounded">deno.json</code>
              </li>
              <li>
                Ensure your{" "}
                <code className="bg-muted px-1 rounded">imports</code> field
                includes <code className="bg-muted px-1 rounded">deco/</code>{" "}
                packages
              </li>
              <li>Connect this plugin to your site folder</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
