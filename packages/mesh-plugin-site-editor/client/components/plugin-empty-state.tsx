/**
 * Plugin Empty State Component
 *
 * Shown when no compatible connection is available.
 */

import { LayoutAlt03 } from "@untitledui/icons";

export default function PluginEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <LayoutAlt03 size={48} className="text-muted-foreground mb-4" />
      <h3 className="text-lg font-medium mb-2">No connection configured</h3>
      <p className="text-muted-foreground text-center max-w-md">
        Connect a local-dev project to start building pages with the site
        editor.
      </p>
    </div>
  );
}
