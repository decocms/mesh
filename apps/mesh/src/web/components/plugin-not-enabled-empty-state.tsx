/**
 * Empty state shown when a user navigates to a feature
 * whose plugin is not yet enabled for the current project.
 *
 * Renders an inline "Enable" button so the user can activate
 * the plugin without leaving the page.
 */

import { Button } from "@deco/ui/components/button.tsx";
import { EmptyState } from "@/web/components/empty-state";
import { useEnablePlugin } from "@/web/hooks/use-enable-plugin";
import { toast } from "sonner";
import type { ReactNode } from "react";

interface PluginNotEnabledEmptyStateProps {
  /** The plugin ID to enable (e.g. "workflows") */
  pluginId: string;
  /** Headline shown in the empty state */
  title: string;
  /** Explanatory copy below the headline */
  description: string;
  /** Optional icon/illustration rendered above the text */
  icon?: ReactNode;
}

export function PluginNotEnabledEmptyState({
  pluginId,
  title,
  description,
  icon,
}: PluginNotEnabledEmptyStateProps) {
  const enablePlugin = useEnablePlugin();

  const handleEnable = async () => {
    try {
      await enablePlugin.mutateAsync(pluginId);
      toast.success("Plugin enabled!");
    } catch {
      toast.error("Failed to enable plugin. Please try again.");
    }
  };

  return (
    <EmptyState
      image={icon ?? null}
      title={title}
      description={description}
      actions={
        <Button onClick={handleEnable} disabled={enablePlugin.isPending}>
          {enablePlugin.isPending ? "Enabling…" : "Enable plugin"}
        </Button>
      }
    />
  );
}
