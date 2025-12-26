import {
  useCurrentStep,
  useCurrentStepName,
  useCurrentStepTab,
  useTrackingExecutionId,
  useWorkflowActions,
  useWorkflowSteps,
} from "@/web/components/details/workflow/stores/workflow";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@deco/ui/components/tabs.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  CodeAction,
  Step,
  ToolCallAction,
  WaitForSignalAction,
} from "@decocms/bindings/workflow";
import { MonacoCodeEditor } from "./monaco-editor";
import { Button } from "@deco/ui/components/button.tsx";
import { CodeXml, GitBranch, Loader2 } from "lucide-react";
import {
  useConnection,
  useConnections,
} from "@/web/hooks/collections/use-connection";
import { usePollingWorkflowExecution } from "../hooks/use-workflow-collection-item";
import { useWorkflow } from "@/web/components/details/workflow/stores/workflow";
import { CheckCircle, Clock, XCircle } from "lucide-react";
import { useWorkflowExecutionCollectionList } from "../hooks/use-workflow-collection-item";
import { ScrollArea } from "@deco/ui/components/scroll-area.tsx";
import { useMembers } from "@/web/hooks/use-members";
import { Avatar } from "@deco/ui/components/avatar.tsx";
import { ListRow } from "@/web/components/list-row.tsx";
import { ItemCard, ToolComponent } from "./tool-selector";
import { MentionItem } from "@/web/components/tiptap-mentions-input";
import { McpTool, useMcp } from "@/web/hooks/use-mcp";
import { usePanelsActions } from "../stores/panels";
import { useActiveView } from "../stores/panels";
import { useToolActionTab } from "../stores/step-tabs";

function StepTabsList() {
  const activeTab = useCurrentStepTab();
  const { setCurrentStepTab } = useWorkflowActions();
  const selectedExecutionId = useTrackingExecutionId();
  const currentStepName = useCurrentStepName();
  const trackingExecutionId = useTrackingExecutionId();
  return (
    <TabsList className="w-full rounded-none bg-transparent p-0">
      <TabsTrigger
        className={cn(
          "border-0 border-b border-border p-0 h-full rounded-none w-full font-sans text-sm font-normal text-foreground shadow-none!",
          activeTab === "input" && "border-foreground",
        )}
        value="input"
        onClick={() => setCurrentStepTab("input")}
      >
        Input
      </TabsTrigger>
      {selectedExecutionId && (
        <TabsTrigger
          className={cn(
            "border-0 border-b border-border p-0 h-full rounded-none w-full font-sans text-sm font-normal text-foreground shadow-none!",
            activeTab === "output" && "border-foreground",
          )}
          value="output"
          onClick={() => setCurrentStepTab("output")}
        >
          <span>Output</span>
        </TabsTrigger>
      )}
      {currentStepName !== "Manual" && !trackingExecutionId && (
        <TabsTrigger
          className={cn(
            "border-0 border-b border-border p-0 h-full rounded-none w-full font-sans text-sm font-normal text-foreground shadow-none!",
            activeTab === "action" && "border-foreground",
          )}
          value="action"
          onClick={() => setCurrentStepTab("action")}
        >
          Action
        </TabsTrigger>
      )}
    </TabsList>
  );
}

export function ExecutionsTab() {
  const workflow = useWorkflow();
  const { list: executions } = useWorkflowExecutionCollectionList({
    workflowId: workflow.id,
  });

  return (
    <div className="h-full w-full">
      <ScrollArea className="h-full">
        <div className="flex flex-col">
          {executions.length === 0 && (
            <div className="flex items-center justify-center h-20 text-muted-foreground text-sm">
              No executions yet
            </div>
          )}
          {executions.map((execution) => (
            <ExecutionBar key={execution.id} executionId={execution.id} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function useExecution(executionId: string) {
  const workflow = useWorkflow();
  const { list: executions } = useWorkflowExecutionCollectionList({
    workflowId: workflow.id,
  });
  return executions.find((execution) => execution.id === executionId);
}

const ExecutionStatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case "success":
      return <CheckCircle className="w-4 h-4 text-success" />;
    case "running":
      return <Loader2 className="w-4 h-4 animate-spin text-warning" />;
    case "error":
      return <XCircle className="w-4 h-4 text-destructive" />;
    case "enqueued":
      return <Clock className="w-4 h-4 text-muted-foreground" />;
    default:
      return null;
  }
};

export function ExecutionBar({ executionId }: { executionId: string }) {
  const { setTrackingExecutionId } = useWorkflowActions();
  const { data } = useMembers();
  const trackingExecutionId = useTrackingExecutionId();
  const execution = useExecution(executionId);
  const isTrackingExecution = trackingExecutionId === executionId;

  if (!execution) return null;

  const memberName = data?.data?.members.find(
    (m) => m.userId === execution.created_by,
  )?.user?.name;

  return (
    <ListRow
      selected={isTrackingExecution}
      onClick={() => setTrackingExecutionId(execution.id)}
      className="border-b border-border"
    >
      <ListRow.Icon>
        <ExecutionStatusIcon status={execution.status} />
      </ListRow.Icon>
      <ListRow.Content className="flex items-center gap-2">
        <ListRow.Title>
          {new Date(execution.created_at).toLocaleString()}
        </ListRow.Title>
        <ListRow.Subtitle>{execution.id.slice(0, 8)}...</ListRow.Subtitle>
      </ListRow.Content>
      {memberName && (
        <ListRow.Trailing className="text-xs font-medium text-muted-foreground">
          {memberName}
        </ListRow.Trailing>
      )}
    </ListRow>
  );
}

export function WorkflowTabs() {
  const activeView = useActiveView();
  const { setActiveView } = usePanelsActions();
  return (
    <div className="bg-muted border border-border rounded-lg flex">
      <Button
        variant="outline"
        size="xs"
        className={cn(
          "h-7 border-0 text-foreground",
          activeView === "canvas" && "bg-transparent text-muted-foreground",
        )}
        onClick={() => setActiveView("canvas")}
      >
        <GitBranch className="w-4 h-4" />
      </Button>
      <Button
        variant="outline"
        size="xs"
        className={cn(
          "h-7 border-0 text-foreground",
          activeView === "code" && "bg-transparent text-muted-foreground",
        )}
        onClick={() => setActiveView("code")}
      >
        <CodeXml className="w-4 h-4" />
      </Button>
    </div>
  );
}

function OutputTabContent({ executionId }: { executionId: string }) {
  const { item: pollingExecution, step_results } =
    usePollingWorkflowExecution(executionId);
  const currentStepName = useCurrentStepName();

  const output = currentStepName
    ? currentStepName === "Manual"
      ? (pollingExecution?.output ?? pollingExecution?.error ?? null)
      : (() => {
          const stepResult = step_results?.find(
            (result) => result.step_id === currentStepName,
          );
          return stepResult?.output ?? stepResult?.error ?? null;
        })()
    : (pollingExecution?.output ?? pollingExecution?.error ?? null);

  if (
    pollingExecution?.status === "running" ||
    pollingExecution?.status === "enqueued"
  ) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground text-sm">Loading execution...</p>
      </div>
    );
  }

  if (pollingExecution?.status === "cancelled") {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <XCircle className="w-4 h-4 text-destructive" />
        <p className="text-destructive text-sm">Execution cancelled</p>
      </div>
    );
  }

  return (
    <div className="h-full bg-background">
      <MonacoCodeEditor
        height="100%"
        readOnly={true}
        code={JSON.stringify(output, null, 2)}
        language="json"
      />
    </div>
  );
}

export function StepHeader() {
  const currentStep = useCurrentStep();
  const connection = useConnection(
    (currentStep?.action as ToolCallAction)?.connectionId ?? "",
  );
  return (
    <div className="p-4 flex flex-col gap-4 bg-background">
      <div className="flex items-center gap-2 bg-background">
        <Avatar
          url={connection?.icon ?? ""}
          fallback={currentStep?.name?.charAt(0) ?? ""}
        />
        <p className="text-sm font-medium">{currentStep?.name}</p>
      </div>
      <p className="text-muted-foreground text-xs">
        {currentStep?.description ?? connection?.description ?? ""}
      </p>
    </div>
  );
}

export function StepTabs() {
  const activeTab = useCurrentStepTab();
  const trackingExecutionId = useTrackingExecutionId();
  const { setCurrentStepTab, updateStep } = useWorkflowActions();
  const currentStep = useCurrentStep();
  const currentStepName = useCurrentStepName();
  const handleTabChange = (tab: "input" | "output" | "action") => {
    setCurrentStepTab(tab);
  };
  const selectedExecutionId = useTrackingExecutionId();
  if (!currentStep && currentStepName !== "Manual") return null;
  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) =>
        handleTabChange(value as "input" | "output" | "action")
      }
      className="h-full w-full gap-0"
    >
      <div className="h-10 bg-background">
        <StepTabsList />
      </div>
      <TabsContent
        className="flex-1 h-[calc(100%-40px)] bg-background"
        value={activeTab}
      >
        {activeTab === "output" && selectedExecutionId && (
          <div className="h-full">
            <OutputTabContent executionId={selectedExecutionId} />
          </div>
        )}
        {activeTab === "input" && (
          <MonacoCodeEditor
            key={`input-${currentStep?.name}`}
            height="100%"
            code={JSON.stringify(currentStep?.input ?? {}, null, 2)}
            language="json"
            onSave={(input) => {
              updateStep(currentStep?.name ?? "", {
                input: JSON.parse(input) as Record<string, unknown>,
              });
            }}
          />
        )}

        {currentStep && activeTab === "action" && !trackingExecutionId && (
          <ActionTab step={currentStep} />
        )}
      </TabsContent>
    </Tabs>
  );
}

function ActionTab({
  step,
}: {
  step: Step & {
    action: ToolCallAction | CodeAction | WaitForSignalAction;
  };
}) {
  const { updateStep } = useWorkflowActions();
  if ("toolName" in step.action) {
    return (
      <div className="h-full bg-background">
        <ToolAction />
      </div>
    );
  } else if ("code" in step.action) {
    return (
      <div className="h-[calc(100%-60px)] bg-background">
        <MonacoCodeEditor
          key={`code-${step.name}`}
          height="100%"
          code={step.action.code}
          language="typescript"
          onSave={(code, outputSchema) => {
            // Extract output schema from the TypeScript code

            updateStep(step.name, {
              action: { ...step.action, code },
              outputSchema: outputSchema as Record<string, unknown> | null,
            });
          }}
        />
      </div>
    );
  }
  return null;
}
function jsonSchemaToMentionItems(
  schema: Record<string, unknown>,
  prefix = "",
): MentionItem[] {
  if (schema?.type === "object" && schema?.properties) {
    return Object.entries(schema.properties as Record<string, unknown>).map(
      ([key, value]) => {
        const children = jsonSchemaToMentionItems(
          value as Record<string, unknown>,
          `${prefix}${key}.`,
        );
        return {
          id: `${prefix}${key}`,
          label: key,
          ...(children.length > 0 && { children }),
        };
      },
    );
  }
  if (schema?.type === "array" && schema?.items) {
    const itemSchema = schema?.items as Record<string, unknown>;
    return jsonSchemaToMentionItems(itemSchema, prefix);
  }
  return [];
}

function ConnectionSelector({
  selectedConnectionName,
  onSelect,
}: {
  selectedConnectionName: string | null;
  onSelect: (connectionId: string) => void;
}) {
  const connections = useConnections();
  const selectedConnection = connections.find(
    (c) => c.title === selectedConnectionName,
  );
  const sortedWithSelectedConnectionAtFirst = connections.sort((a, b) => {
    if (a.title === selectedConnectionName) return -1;
    if (b.title === selectedConnectionName) return 1;
    return a.title.localeCompare(b.title);
  });
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {sortedWithSelectedConnectionAtFirst.map((connection) => (
          <ItemCard
            key={connection.id}
            selected={selectedConnection?.id === connection.id}
            item={{
              icon: connection.icon,
              title: connection.title,
            }}
            onClick={() => onSelect(connection.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ToolAction() {
  const currentStep = useCurrentStep();
  const stepAsTool = currentStep as Step & {
    action: ToolCallAction;
  };
  const { updateStep } = useWorkflowActions();
  const { activeTab, setActiveTab } = useToolActionTab();
  const { tool, connection } = useTool(
    stepAsTool?.action?.connectionId ?? "",
    stepAsTool?.action?.toolName ?? "",
  );

  return (
    <div className="w-full h-full flex flex-col">
      {activeTab === "connections" && (
        <div className="h-full flex flex-col">
          <ConnectionSelector
            selectedConnectionName={connection?.title ?? null}
            onSelect={(connectionId) => {
              updateStep(stepAsTool.name, {
                action: { ...stepAsTool.action, connectionId },
              });
              setActiveTab("tools");
            }}
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
            toolName={stepAsTool?.action?.toolName ?? null}
            stepAsTool={stepAsTool}
            onSelect={(toolName) => {
              setActiveTab("tool");
              updateStep(stepAsTool.name, {
                action: { ...stepAsTool.action, toolName },
                outputSchema: tool?.outputSchema as Record<
                  string,
                  unknown
                > | null,
              });
            }}
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
          <SelectedTool step={stepAsTool} />
        </div>
      )}
    </div>
  );
}

function ToolSelector({
  stepAsTool,
  onSelect,
  toolName,
}: {
  stepAsTool: Step & {
    action: ToolCallAction;
  };
  onSelect: (toolName: string) => void;
  toolName?: string;
}) {
  const connection = useConnection(stepAsTool?.action?.connectionId ?? "");
  const tools = connection?.tools ?? [];
  const sortedWithSelectedToolAtFirst = tools.sort((a, b) => {
    if (a.name === toolName) return -1;
    if (b.name === toolName) return 1;
    return a.name.localeCompare(b.name);
  });
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {sortedWithSelectedToolAtFirst.map((tool) => (
          <ItemCard
            key={tool.name}
            selected={tool.name === toolName}
            item={{
              icon: connection?.icon ?? null,
              title: tool.name,
            }}
            onClick={() => onSelect(tool.name)}
          />
        ))}
      </div>
    </div>
  );
}

function useTool(connectionId: string, toolName: string) {
  const mcp = useMcp({
    url: `/mcp/${connectionId}`,
    enabled: !!connectionId && !!toolName,
  });
  const connection = useConnection(connectionId);
  const tool = connection?.tools?.find((t) => t.name === toolName);
  return {
    tool,
    mcp,
    connection,
  };
}

function SelectedTool({
  step,
}: {
  step: Step & {
    action: ToolCallAction;
  };
}) {
  const { tool, mcp, connection } = useTool(
    step?.action?.connectionId ?? "",
    step?.action?.toolName ?? "",
  );
  const { updateStep } = useWorkflowActions();
  const handleInputChange = (inputParams: Record<string, unknown>) => {
    if (!step?.action?.toolName) return;
    updateStep(step?.name, {
      input: inputParams,
    });
  };
  const workflowSteps = useWorkflowSteps();

  const allMentions = workflowSteps.map((step) => ({
    id: step.name,
    label: step.name,
    children: jsonSchemaToMentionItems(
      step.outputSchema as Record<string, unknown>,
      `${step.name}.`,
    ),
  }));

  if (!tool) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className="overflow-scroll h-full">
      <ToolComponent
        tool={tool as McpTool}
        connection={connection}
        onInputChange={handleInputChange}
        initialInputParams={step?.input ?? {}}
        mentions={allMentions}
        mcp={mcp}
      />
    </div>
  );
}
