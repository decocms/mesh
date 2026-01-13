import { CollectionHeader } from "@/web/components/collections/collection-header.tsx";
import { CollectionPage } from "@/web/components/collections/collection-page.tsx";
import {
  useOrganizationSettings,
  useOrganizationSettingsActions,
} from "@/web/hooks/collections/use-organization-settings";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Button } from "@deco/ui/components/button.tsx";
import { Card } from "@deco/ui/components/card.tsx";
import { Switch } from "@deco/ui/components/switch.tsx";
import { ArrowLeft } from "@untitledui/icons";
import { useState } from "react";
import { toast } from "sonner";
import { sourcePlugins } from "../../../plugins";
import { pluginRootSidebarItems } from "../../../index";
import { Link } from "@tanstack/react-router";

export default function PluginsSettings() {
  const { org } = useProjectContext();
  const orgSettings = useOrganizationSettings(org.id);
  const { update } = useOrganizationSettingsActions(org.id);

  // Track only pending changes (pluginId -> intended state)
  // This pattern avoids sync issues: we derive state from server + pending changes
  const [pendingChanges, setPendingChanges] = useState<Record<string, boolean>>(
    {},
  );
  const [isSaving, setIsSaving] = useState(false);

  const serverPlugins = orgSettings?.enabled_plugins ?? [];

  // Derive whether a plugin is enabled: pending changes override server state
  const isPluginEnabled = (pluginId: string): boolean => {
    const pending = pendingChanges[pluginId];
    if (pending !== undefined) {
      return pending;
    }
    return serverPlugins.includes(pluginId);
  };

  // Compute the full list of enabled plugins for saving
  const getEnabledPluginsList = (): string[] => {
    const result = new Set(serverPlugins);
    for (const [pluginId, enabled] of Object.entries(pendingChanges)) {
      if (enabled) {
        result.add(pluginId);
      } else {
        result.delete(pluginId);
      }
    }
    return Array.from(result);
  };

  // Check if there are unsaved changes
  const hasChanges = Object.keys(pendingChanges).length > 0;

  const handleTogglePlugin = (pluginId: string, enabled: boolean) => {
    const serverEnabled = serverPlugins.includes(pluginId);

    if (enabled === serverEnabled) {
      // User toggled back to server state, remove from pending changes
      setPendingChanges((prev) => {
        const { [pluginId]: _, ...rest } = prev;
        return rest;
      });
    } else {
      // User changed from server state, track as pending change
      setPendingChanges((prev) => ({ ...prev, [pluginId]: enabled }));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await update.mutateAsync({ enabled_plugins: getEnabledPluginsList() });
      setPendingChanges({}); // Clear pending changes on success
      toast.success("Plugin settings saved");
    } catch {
      toast.error("Failed to save plugin settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setPendingChanges({});
  };

  // Get plugin metadata from sidebar items
  const getPluginMeta = (pluginId: string) => {
    return pluginRootSidebarItems.find((item) => item.pluginId === pluginId);
  };

  // Get plugin description from the source plugin
  const getPluginDescription = (pluginId: string) => {
    const plugin = sourcePlugins.find((p) => p.id === pluginId);
    return plugin?.description ?? null;
  };

  return (
    <CollectionPage>
      <CollectionHeader title="Plugins" />

      <div className="flex-1 overflow-auto">
        <div className="flex h-full">
          <div className="flex-1 overflow-auto">
            <div className="p-5 max-w-2xl">
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <Link
                    to="/$org/settings"
                    params={{ org: org.slug }}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Link>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">
                      Plugins
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Enable or disable plugins for your organization.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {sourcePlugins.map((plugin) => {
                    const meta = getPluginMeta(plugin.id);
                    const description = getPluginDescription(plugin.id);
                    const isEnabled = isPluginEnabled(plugin.id);

                    return (
                      <Card
                        key={plugin.id}
                        className="p-4 flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {meta?.icon && (
                            <div className="flex-shrink-0 text-muted-foreground">
                              {meta.icon}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-medium text-foreground">
                              {meta?.label ?? plugin.id}
                            </div>
                            {description && (
                              <p className="text-sm text-muted-foreground truncate">
                                {description}
                              </p>
                            )}
                          </div>
                        </div>
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={(checked) =>
                            handleTogglePlugin(plugin.id, checked)
                          }
                          disabled={isSaving}
                        />
                      </Card>
                    );
                  })}

                  {sourcePlugins.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No plugins available
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 pt-4">
                  <Button
                    onClick={handleSave}
                    disabled={!hasChanges || isSaving}
                    className="min-w-24"
                  >
                    {isSaving ? "Saving..." : "Save Changes"}
                  </Button>
                  {hasChanges && (
                    <Button
                      variant="outline"
                      onClick={handleCancel}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </CollectionPage>
  );
}
