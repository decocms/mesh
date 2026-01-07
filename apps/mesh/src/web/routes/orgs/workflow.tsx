import { getWellKnownMcpStudioConnection } from "@/core/well-known-mcp";
import { BindingCollectionView } from "@/web/components/binding-collection-view";

export default function WorkflowPage() {
  return (
    <BindingCollectionView
      bindingName="WORKFLOW"
      collectionName="workflow"
      title="Workflows"
      emptyState={{
        title: "Create Workflows",
        description:
          "Install MCP Studio to create and manage automated workflows with multiple steps and integrations.",
      }}
      wellKnownMcp={getWellKnownMcpStudioConnection()}
    />
  );
}
