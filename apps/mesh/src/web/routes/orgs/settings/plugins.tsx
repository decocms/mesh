import { CollectionHeader } from "@/web/components/collections/collection-header.tsx";
import { CollectionPage } from "@/web/components/collections/collection-page.tsx";
import {
  useOrganizationSettings,
  useOrganizationSettingsActions,
} from "@/web/hooks/collections/use-organization-settings";
import { useProjectContext } from "@decocms/mesh-sdk";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@deco/ui/components/breadcrumb.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Switch } from "@deco/ui/components/switch.tsx";
import { ArrowLeft } from "@untitledui/icons";
import { useState } from "react";
import { toast } from "sonner";
import { sourcePlugins } from "../../../plugins";
import { pluginRootSidebarItems } from "../../../index";
import { Link, useNavigate } from "@tanstack/react-router";

export default function PluginsSettings() {
  const { org } = useProjectContext();
  const navigate = useNavigate();
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
      setPendingChanges({});
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
      <CollectionHeader
        title={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/$org/settings" params={{ org: org.slug }}>
                    Settings
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Plugins</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        leftElement={
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            onClick={() =>
              navigate({ to: "/$org/settings", params: { org: org.slug } })
            }
          >
            <ArrowLeft className="size-4" />
          </Button>
        }
      />

      <div className="flex-1 overflow-auto">
        <div className="flex h-full">
          <div className="flex-1 overflow-auto">
            <div className="p-5 max-w-2xl">
              <div className="space-y-6">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Enable or disable plugins for your organization.
                  </p>
                </div>

                <div className="divide-y divide-border border-y border-border">
                  {sourcePlugins.map((plugin) => {
                    const meta = getPluginMeta(plugin.id);
                    const description = getPluginDescription(plugin.id);
                    const isEnabled = isPluginEnabled(plugin.id);

                    return (
                      <div
                        key={plugin.id}
                        className="flex items-center justify-between gap-4 py-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {meta?.icon && (
                            <div className="flex-shrink-0 text-muted-foreground [&>svg]:size-4">
                              {meta.icon}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-foreground">
                              {meta?.label ?? plugin.id}
                            </div>
                            {description && (
                              <p className="text-xs text-muted-foreground">
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
                      </div>
                    );
                  })}
                </div>

                {sourcePlugins.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No plugins available.
                  </p>
                )}

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
