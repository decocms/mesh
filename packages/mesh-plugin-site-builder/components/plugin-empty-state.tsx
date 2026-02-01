/**
 * Plugin Empty State Component
 *
 * Shown when no Site Builder connection is available.
 * Provides instructions on how to connect a Deco site.
 */

import { Globe01, FolderPlus } from "@untitledui/icons";

export default function PluginEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Globe01 size={32} className="text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">No Site Connected</h3>
      <p className="text-muted-foreground max-w-md mb-6">
        Connect a local Deco site to start building with AI-assisted editing and
        live preview.
      </p>

      <div className="bg-muted/50 rounded-lg p-6 max-w-lg text-left space-y-4">
        <div className="flex items-start gap-3">
          <div className="mt-1">
            <FolderPlus size={20} className="text-primary" />
          </div>
          <div>
            <h4 className="font-medium mb-1">How to connect a site</h4>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Add a local filesystem MCP connection</li>
              <li>Point it to your Deco site folder</li>
              <li>The site will be detected automatically</li>
            </ol>
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            <strong>Tip:</strong> Sites are detected by checking for{" "}
            <code className="bg-muted px-1 rounded">deno.json</code> with{" "}
            <code className="bg-muted px-1 rounded">deco/</code> imports.
          </p>
        </div>
      </div>
    </div>
  );
}
