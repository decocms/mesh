/**
 * Plugin Empty State Component
 *
 * Shown when no Task Runner connection is available.
 */

import { File04 } from "@untitledui/icons";

export default function PluginEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <File04 size={32} className="text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">No Task Runner Connected</h3>
      <p className="text-muted-foreground max-w-md mb-4">
        Connect a Task Runner MCP to manage tasks with Beads and run agent
        execution loops.
      </p>
      <p className="text-sm text-muted-foreground">
        Install the{" "}
        <code className="bg-muted px-1 rounded">mcp-task-runner</code> MCP from
        the registry to get started.
      </p>
    </div>
  );
}
