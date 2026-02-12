/**
 * Plugin Empty State Component
 *
 * Shown when no workflow connections are available.
 */

import { Dataflow03 } from "@untitledui/icons";

export default function PluginEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <Dataflow03 size={48} className="text-muted-foreground mb-4" />
      <h3 className="text-lg font-medium mb-2">No workflows connected</h3>
      <p className="text-muted-foreground text-center max-w-md">
        Connect a workflow provider to create and manage automated workflows
        with multiple steps and integrations.
      </p>
    </div>
  );
}
