import { Button } from "@deco/ui/components/button.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { ArrowLeft } from "@untitledui/icons";
import {
  useConnections,
  useConnection,
} from "@/web/hooks/collections/use-connection";
import { IntegrationIcon } from "@/web/components/integration-icon";
import { usePrioritizedList } from "../hooks";
import { useCurrentStep, useWorkflowActions } from "../stores/workflow";

interface ToolSidebarProps {
  className?: string;
}

export function ToolSidebar({ className }: ToolSidebarProps) {
  const currentStep = useCurrentStep();
  const isToolStep = currentStep && "toolName" in currentStep.action;
  const connectionId =
    isToolStep && "connectionId" in currentStep.action
      ? currentStep.action.connectionId
      : null;

  // If step has a connectionId, show tool selector; otherwise show connection selector
  if (connectionId) {
    return <ToolSelector connectionId={connectionId} className={className} />;
  }

  return <ConnectionSelector className={className} />;
}

// ============================================================================
// Connection Selector
// ============================================================================

function ConnectionSelector({ className }: { className?: string }) {
  const connections = useConnections();
  const currentStep = useCurrentStep();
  const { updateStep } = useWorkflowActions();

  const isToolStep = currentStep && "toolName" in currentStep.action;
  const selectedConnectionId =
    isToolStep && "connectionId" in currentStep.action
      ? currentStep.action.connectionId
      : null;

  const selectedConnection = connections.find(
    (c) => c.id === selectedConnectionId,
  );

  const prioritizedConnections = usePrioritizedList(
    connections,
    selectedConnection ?? null,
    (c) => c.title,
    (a, b) => a.title.localeCompare(b.title),
  );

  const handleSelectConnection = (connectionId: string) => {
    if (!currentStep) return;
    updateStep(currentStep.name, {
      action: {
        ...currentStep.action,
        connectionId,
        toolName: "",
      },
    });
  };

  return (
    <div className={cn("flex flex-col h-full bg-sidebar", className)}>
      {/* Header */}
      <div className="h-12 flex items-center px-5 border-b border-border">
        <span className="text-base font-medium text-foreground">
          Select MCP Server
        </span>
      </div>

      {/* Connection List */}
      <div className="flex-1 overflow-auto">
        {prioritizedConnections.map((connection) => (
          <SidebarRow
            key={connection.id}
            icon={connection.icon}
            title={connection.title}
            isSelected={connection.id === selectedConnectionId}
            onClick={() => handleSelectConnection(connection.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Tool Selector
// ============================================================================

function ToolSelector({
  connectionId,
  className,
}: {
  connectionId: string;
  className?: string;
}) {
  const connection = useConnection(connectionId);
  const currentStep = useCurrentStep();
  const { updateStep } = useWorkflowActions();

  const tools = connection?.tools ?? [];
  const isToolStep = currentStep && "toolName" in currentStep.action;
  const selectedToolName =
    isToolStep && "toolName" in currentStep.action
      ? currentStep.action.toolName
      : null;

  const selectedTool = tools.find((t) => t.name === selectedToolName);

  const prioritizedTools = usePrioritizedList(
    tools,
    selectedTool ?? null,
    (t) => t.name,
    (a, b) => a.name.localeCompare(b.name),
  );

  const handleSelectTool = (toolName: string) => {
    if (!currentStep) return;

    // Find the selected tool to get its outputSchema
    const selectedToolData = tools.find((t) => t.name === toolName);

    updateStep(currentStep.name, {
      action: {
        ...currentStep.action,
        toolName,
      },
      // Set the step's outputSchema to the tool's outputSchema
      outputSchema: selectedToolData?.outputSchema ?? {},
    });
  };

  const handleBack = () => {
    if (!currentStep) return;
    updateStep(currentStep.name, {
      action: {
        ...currentStep.action,
        connectionId: "",
        toolName: "",
      },
    });
  };

  return (
    <div className={cn("flex flex-col h-full bg-sidebar", className)}>
      {/* Header with back button */}
      <div className="flex items-start border-b border-border">
        {/* Back Button */}
        <div className="flex items-center justify-center size-12 border-r border-border">
          <Button
            variant="ghost"
            size="icon"
            className="size-10 text-muted-foreground hover:text-foreground"
            onClick={handleBack}
          >
            <ArrowLeft size={14} />
          </Button>
        </div>

        {/* Title and Connection */}
        <div className="flex-1 flex items-center gap-2 h-12 px-5 min-w-0">
          <span className="text-base font-medium text-foreground">
            Select tool
          </span>

          {/* Connection Badge */}
          <div className="flex items-center gap-2 ml-auto">
            <IntegrationIcon
              icon={connection?.icon ?? null}
              name={connection?.title ?? ""}
              size="xs"
              className="shadow-sm"
            />
            <span className="text-sm font-medium text-foreground truncate">
              {connection?.title}
            </span>
          </div>
        </div>
      </div>

      {/* Tool List */}
      <div className="flex-1 overflow-auto">
        {prioritizedTools.map((tool) => (
          <SidebarRow
            key={tool.name}
            icon={connection?.icon ?? null}
            title={tool.name}
            isSelected={tool.name === selectedToolName}
            onClick={() => handleSelectTool(tool.name)}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Shared Components
// ============================================================================

interface SidebarRowProps {
  icon: string | null;
  title: string;
  isSelected: boolean;
  onClick: () => void;
}

function SidebarRow({ icon, title, isSelected, onClick }: SidebarRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 min-h-14 px-5 py-4 cursor-pointer transition-colors",
        "hover:bg-muted/50",
        isSelected && "bg-muted/50",
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <IntegrationIcon
        icon={icon}
        name={title}
        size="xs"
        className="shadow-sm"
      />
      <span className="flex-1 text-sm font-medium text-foreground truncate">
        {title}
      </span>
    </div>
  );
}
