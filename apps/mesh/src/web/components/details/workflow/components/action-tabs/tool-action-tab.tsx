import { ItemCard } from "../tool-selector";
import { ConnectionSelector } from "../tool-selection/connection-selector";
import { ToolSelector } from "../tool-selection/tool-selector";
import { ToolStep } from "../tool-selection/tool-configurator";
import { useToolActionFlow } from "../tool-selection/hooks/use-tool-action-flow";
import { useTrackingExecutionId } from "../../stores/workflow";

export function ToolActionTab() {
  const {
    toolStep,
    activeTab,
    setActiveTab,
    connection,
    handleConnectionSelect,
    handleToolSelect,
  } = useToolActionFlow();
  const trackingExecutionId = useTrackingExecutionId();

  const toolName = toolStep?.action?.toolName;
  const connectionId = toolStep?.action?.connectionId;

  if (!toolStep) return null;

  if (trackingExecutionId) return <ToolStep step={toolStep} />;

  return (
    <div className="w-full h-full flex flex-col">
      {(activeTab === "connections" || (!toolName && !connectionId)) && (
        <div className="h-full flex flex-col">
          <ConnectionSelector
            selectedConnectionName={connection?.title ?? null}
            onSelect={handleConnectionSelect}
          />
        </div>
      )}
      {activeTab === "tools" && (
        <div className="h-full flex flex-col">
          <ItemCard
            backButton
            onClick={() => setActiveTab("connections")}
            item={{
              icon: connection?.icon ?? null,
              title: connection?.title ?? "",
            }}
          />
          <ToolSelector
            toolName={toolStep?.action?.toolName ?? null}
            toolStep={toolStep}
            onSelect={handleToolSelect}
          />
        </div>
      )}
      {activeTab === "tool" && connection && (
        <div className="h-full flex flex-col">
          <ItemCard
            backButton
            onClick={() => setActiveTab("tools")}
            item={{
              icon: connection?.icon ?? null,
              title: connection.title,
            }}
          />
          <ToolStep step={toolStep} />
        </div>
      )}
    </div>
  );
}
