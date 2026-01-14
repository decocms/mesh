/**
 * Plugin Empty State Component
 *
 * Shown when no storage connections are available.
 */

import { Folder } from "@untitledui/icons";

export default function PluginEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <Folder size={48} className="text-muted-foreground mb-4" />
      <h3 className="text-lg font-medium mb-2">No storage connected</h3>
      <p className="text-muted-foreground text-center max-w-md">
        Connect an S3-compatible storage service to browse and manage files.
      </p>
    </div>
  );
}
