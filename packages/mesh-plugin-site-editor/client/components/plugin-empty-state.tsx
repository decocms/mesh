/**
 * Plugin Empty State Component
 *
 * Shown when no site connections are available.
 */

import { File06 } from "@untitledui/icons";

export default function PluginEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <File06 size={48} className="text-muted-foreground mb-4" />
      <h3 className="text-lg font-medium mb-2">No site connected</h3>
      <p className="text-muted-foreground text-center max-w-md">
        Connect a local-fs MCP server to manage your site's pages, sections, and
        loaders.
      </p>
    </div>
  );
}
