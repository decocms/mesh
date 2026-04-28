import { type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useProjectContext } from "@decocms/mesh-sdk";
import { KEYS } from "@/web/lib/query-keys";
import { useUpdateOrganizationSettings } from "@/web/hooks/use-organization-settings";
import { Switch } from "@deco/ui/components/switch.tsx";
import { toast } from "sonner";
import { Container } from "@untitledui/icons";
import { sourcePlugins } from "@/web/plugins";
import { pluginSidebarGroups, pluginSettingsSidebarItems } from "@/web/index";
import type { AnyClientPlugin } from "@decocms/bindings/plugins";

type PluginRowProps = {
  plugin: AnyClientPlugin;
  isEnabled: boolean;
  isSaving: boolean;
  description: string | null;
  label: string;
  icon?: ReactNode;
  onToggle: (pluginId: string, enabled: boolean) => void;
};

function PluginRow({
  plugin,
  isEnabled,
  isSaving,
  description,
  label,
  icon,
  onToggle,
}: PluginRowProps) {
  return (
    <div
      className="flex flex-col border-b border-border last:border-0"
      onClick={() => !isSaving && onToggle(plugin.id, !isEnabled)}
      style={{ cursor: isSaving ? undefined : "pointer" }}
    >
      <div className="flex items-center justify-between gap-6 py-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {icon && (
            <span className="text-muted-foreground mt-0.5 shrink-0 [&>svg]:size-4">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{label}</p>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
          <Switch
            checked={isEnabled}
            onCheckedChange={(checked) => onToggle(plugin.id, checked)}
            disabled={isSaving}
          />
        </div>
      </div>
    </div>
  );
}

export function ProjectPluginsForm() {
  const { org, project } = useProjectContext();
  const queryClient = useQueryClient();

  const serverPlugins = project.enabledPlugins ?? [];

  const mutation = useUpdateOrganizationSettings();

  const invalidateDependentCaches = () => {
    queryClient.invalidateQueries({
      queryKey: KEYS.project(org.id, project.slug),
    });
    queryClient.invalidateQueries({
      queryKey: KEYS.projects(org.id),
    });
    queryClient.invalidateQueries({
      predicate: (query) => {
        const k = query.queryKey;
        return (
          k[1] === org.id && k[3] === "collection" && k[4] === "VIRTUAL_MCP"
        );
      },
    });
  };

  const handleTogglePlugin = (pluginId: string, enabled: boolean) => {
    const current = new Set(serverPlugins);
    if (enabled) {
      current.add(pluginId);
    } else {
      current.delete(pluginId);
    }
    mutation.mutate(
      { enabled_plugins: Array.from(current) },
      {
        onSuccess: invalidateDependentCaches,
        onError: (error) => {
          toast.error(
            "Failed to update plugin: " +
              (error instanceof Error ? error.message : "Unknown error"),
          );
        },
      },
    );
  };

  // Get plugin metadata from sidebar groups or settings sidebar items
  const getPluginMeta = (pluginId: string) => {
    const group = pluginSidebarGroups.find((g) => g.pluginId === pluginId);
    if (group) return { label: group.label, icon: group.items[0]?.icon };
    const settingsItem = pluginSettingsSidebarItems.find(
      (i) => i.pluginId === pluginId,
    );
    if (settingsItem)
      return { label: settingsItem.label, icon: settingsItem.icon };
    return null;
  };

  // Get plugin description from the source plugin
  const getPluginDescription = (pluginId: string) => {
    const plugin = sourcePlugins.find((p) => p.id === pluginId);
    return plugin?.description ?? null;
  };

  if (sourcePlugins.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No plugins available.</p>
    );
  }

  return (
    <div className="flex flex-col">
      {sourcePlugins.map((plugin) => {
        const meta = getPluginMeta(plugin.id);
        const description = getPluginDescription(plugin.id);
        const isEnabled = serverPlugins.includes(plugin.id);

        return (
          <PluginRow
            key={plugin.id}
            plugin={plugin}
            isEnabled={isEnabled}
            isSaving={mutation.isPending}
            description={description}
            label={meta?.label ?? plugin.id}
            icon={meta?.icon ?? <Container size={14} />}
            onToggle={handleTogglePlugin}
          />
        );
      })}
    </div>
  );
}
