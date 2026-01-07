import { getWellKnownMcpStudioConnection } from "@/core/well-known-mcp";
import { BindingCollectionView } from "@/web/components/binding-collection-view";

export default function AssistantPage() {
  return (
    <BindingCollectionView
      bindingName="ASSISTANTS"
      collectionName="assistant"
      title="Assistants"
      emptyState={{
        title: "Create AI Assistants",
        description:
          "Install MCP Studio to create and manage AI assistants with custom system prompts and model configurations.",
      }}
      wellKnownMcp={getWellKnownMcpStudioConnection()}
    />
  );
}
