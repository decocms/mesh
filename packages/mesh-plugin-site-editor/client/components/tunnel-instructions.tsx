/**
 * Tunnel Instructions Component
 *
 * Shows actionable guidance when the dev tunnel isn't running.
 * Three states:
 * 1. No wrangler.toml - guide user to set up their project
 * 2. Tunnel URL known but not reachable - prompt to run `deco link`
 * 3. Reachable - renders nothing (parent handles this)
 */

import { Loading01 } from "@untitledui/icons";

interface TunnelInstructionsProps {
  tunnelUrl: string | null;
  reachable: boolean;
  noWranglerToml: boolean;
  isPolling: boolean;
}

export default function TunnelInstructions({
  tunnelUrl,
  reachable,
  noWranglerToml,
  isPolling,
}: TunnelInstructionsProps) {
  // State 3: Tunnel is reachable — nothing to show
  if (reachable) return null;

  // State 1: No wrangler.toml found
  if (noWranglerToml) {
    return (
      <div className="mx-4 mt-3 rounded-lg border border-border bg-muted/30 p-4">
        <h4 className="text-sm font-medium mb-1">Set up your tunnel</h4>
        <p className="text-sm text-muted-foreground mb-3">
          To enable live preview, your project needs a{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">
            wrangler.toml
          </code>{" "}
          with a workspace configuration. Run the following in your project
          directory:
        </p>
        <pre className="text-xs bg-background border border-border rounded-md px-3 py-2 font-mono">
          npx deco init
        </pre>
      </div>
    );
  }

  // State 2: Has tunnel URL but not reachable
  if (tunnelUrl && !reachable) {
    return (
      <div className="mx-4 mt-3 rounded-lg border border-border bg-muted/30 p-4">
        <h4 className="text-sm font-medium mb-1">Start your dev tunnel</h4>
        <p className="text-sm text-muted-foreground mb-2">
          Run the following command in your project directory to start the
          tunnel:
        </p>
        <pre className="text-xs bg-background border border-border rounded-md px-3 py-2 font-mono mb-2">
          npx deco link
        </pre>
        <p className="text-xs text-muted-foreground mb-2">
          Expected URL:{" "}
          <code className="bg-muted px-1 py-0.5 rounded">{tunnelUrl}</code>
        </p>
        {isPolling && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loading01 size={12} className="animate-spin" />
            <span>Waiting for tunnel... will auto-detect when ready</span>
          </div>
        )}
      </div>
    );
  }

  return null;
}
