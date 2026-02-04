import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useProjectContext,
  useMCPClient,
  SELF_MCP_ALIAS_ID,
} from "@decocms/mesh-sdk";
import { KEYS } from "@/web/lib/query-keys";
import { Label } from "@deco/ui/components/label.tsx";
import { toast } from "sonner";
import { sourcePlugins } from "@/web/plugins";
import { pluginRootSidebarItems } from "@/web/index";
import type { AnyClientPlugin } from "@decocms/bindings/plugins";
import { BindingSelector } from "@/web/components/binding-selector";

type PluginConfigOutput = {
  config: {
    id: string;
    projectId: string;
    pluginId: string;
    connectionId: string | null;
    settings: Record<string, unknown> | null;
  } | null;
};

// Get plugins that require MCP bindings
// A plugin requires MCP binding if it has a `binding` property or `requiresMcpBinding: true`
function pluginRequiresMcpBinding(plugin: AnyClientPlugin): boolean {
  // Check for explicit requiresMcpBinding flag
  if (
    (plugin as AnyClientPlugin & { requiresMcpBinding?: boolean })
      .requiresMcpBinding === true
  ) {
    return true;
  }
  // Check if plugin has a binding definition (means it needs an MCP connection)
  return plugin.binding !== undefined;
}

const pluginsRequiringMcp = sourcePlugins.filter(pluginRequiresMcpBinding);

export function PluginBindingsForm() {
  const { project } = useProjectContext();

  // Only show plugins that are enabled and require MCP binding
  const relevantPlugins = pluginsRequiringMcp.filter((p) =>
    project.enabledPlugins?.includes(p.id),
  );

  if (relevantPlugins.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No enabled plugins require MCP bindings.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Configure which MCP connections are used by each plugin. Only compatible
        connections are shown for each plugin.
      </p>

      <div className="space-y-4">
        {relevantPlugins.map((plugin) => (
          <PluginBindingRow key={plugin.id} plugin={plugin} />
        ))}
      </div>
    </div>
  );
}

function PluginBindingRow({ plugin }: { plugin: AnyClientPlugin }) {
  const { org, project } = useProjectContext();
  const queryClient = useQueryClient();

  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  // Fetch current config
  const { data: configData } = useQuery({
    queryKey: KEYS.projectPluginConfig(project.id ?? "", plugin.id),
    queryFn: async () => {
      const result = (await client.callTool({
        name: "PROJECT_PLUGIN_CONFIG_GET",
        arguments: {
          projectId: project.id,
          pluginId: plugin.id,
        },
      })) as { structuredContent?: unknown };
      return (result.structuredContent ?? result) as PluginConfigOutput;
    },
    enabled: !!project.id,
  });

  const mutation = useMutation({
    mutationFn: async (connectionId: string | null) => {
      const result = (await client.callTool({
        name: "PROJECT_PLUGIN_CONFIG_UPDATE",
        arguments: {
          projectId: project.id,
          pluginId: plugin.id,
          connectionId,
        },
      })) as { structuredContent?: unknown };
      return result.structuredContent ?? result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.projectPluginConfig(project.id ?? "", plugin.id),
      });
      toast.success("Binding updated");
    },
    onError: (error) => {
      toast.error(
        "Failed to update binding: " +
          (error instanceof Error ? error.message : "Unknown error"),
      );
    },
  });

  // Get plugin metadata
  const meta = pluginRootSidebarItems.find(
    (item) => item.pluginId === plugin.id,
  );

  return (
    <div className="flex items-center justify-between gap-4 p-3 border rounded-lg">
      <div className="flex items-center gap-3 min-w-0">
        {meta?.icon && (
          <div className="flex-shrink-0 text-muted-foreground [&>svg]:size-4">
            {meta.icon}
          </div>
        )}
        <Label className="font-medium">{meta?.label ?? plugin.id}</Label>
      </div>
      <BindingSelector
        value={configData?.config?.connectionId ?? null}
        onValueChange={(value) => mutation.mutate(value)}
        binding={plugin.binding}
        placeholder="Select connection..."
        className="w-56"
        disabled={mutation.isPending}
      />
    </div>
  );
}
