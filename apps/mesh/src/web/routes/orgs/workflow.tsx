import { getWellKnownMcpStudioConnection } from "@decocms/mesh-sdk";
import { useProjectContext } from "@decocms/mesh-sdk";
import { BindingCollectionView } from "@/web/components/binding-collection-view";
import { PluginNotEnabledEmptyState } from "@/web/components/plugin-not-enabled-empty-state";
import { Page } from "@/web/components/page";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@deco/ui/components/breadcrumb.tsx";
import { Dataflow03 } from "@untitledui/icons";

const WORKFLOWS_PLUGIN_ID = "workflows";

export default function WorkflowPage() {
  const { project } = useProjectContext();
  const enabledPlugins = project.enabledPlugins ?? [];
  const isPluginEnabled = enabledPlugins.includes(WORKFLOWS_PLUGIN_ID);

  if (!isPluginEnabled) {
    return (
      <Page>
        <Page.Header>
          <Page.Header.Left>
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>Workflows</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </Page.Header.Left>
        </Page.Header>

        <Page.Content>
          <div className="flex flex-col items-center justify-center h-full">
            <PluginNotEnabledEmptyState
              pluginId={WORKFLOWS_PLUGIN_ID}
              title="Enable Workflows"
              description="Automate multi-step processes by enabling the Workflows plugin. Once enabled you can create, run, and monitor workflows."
              icon={
                <div className="bg-muted p-4 rounded-full">
                  <Dataflow03 className="size-8 text-muted-foreground" />
                </div>
              }
            />
          </div>
        </Page.Content>
      </Page>
    );
  }

  return (
    <BindingCollectionView
      bindingName="WORKFLOW"
      collectionName="workflow"
      title="Workflows"
      emptyState={{
        title: "Create Workflows",
        description: "Run durable MCP tool calls in background.",
      }}
      wellKnownMcp={getWellKnownMcpStudioConnection()}
    />
  );
}
