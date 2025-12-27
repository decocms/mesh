import { useCurrentStep } from "@/web/components/details/workflow/stores/workflow";
import { useWorkflowActions } from "@/web/components/details/workflow/stores/workflow";
import { useToolActionTab } from "../../../stores/step-tabs";
import { useTool } from "../../tool-selector";
import { useConnection } from "@/web/hooks/collections/use-connection";
import type { ToolStep } from "../../types";

/**
 * Hook to manage the tool action flow (connections → tools → tool config).
 * Handles tab navigation and step updates when selecting connections and tools.
 */
export function useToolActionFlow() {
  const currentStep = useCurrentStep();
  const toolStep = currentStep as ToolStep | null;
  const { updateStep } = useWorkflowActions();
  const { activeTab, setActiveTab } = useToolActionTab();

  const { tool, connection } = useTool(
    toolStep?.action?.toolName ?? "",
    toolStep?.action?.connectionId ?? "",
  );

  // Get connection for tool selection (needed to find tool schema)
  const connectionForToolSelection = useConnection(
    toolStep?.action?.connectionId ?? "",
  );

  const handleConnectionSelect = (connectionId: string) => {
    if (!toolStep) return;
    updateStep(toolStep.name, {
      action: { ...toolStep.action, connectionId },
    });
    setActiveTab("tools");
  };

  const handleToolSelect = (toolName: string) => {
    if (!toolStep) return;

    // Get the tool from the connection to access its outputSchema
    const selectedTool = connectionForToolSelection?.tools?.find(
      (t) => t.name === toolName,
    );

    setActiveTab("tool");
    updateStep(toolStep.name, {
      action: { ...toolStep.action, toolName },
      outputSchema: selectedTool?.outputSchema as Record<
        string,
        unknown
      > | null,
    });
  };

  return {
    toolStep,
    activeTab,
    setActiveTab,
    connection,
    tool,
    handleConnectionSelect,
    handleToolSelect,
  };
}
