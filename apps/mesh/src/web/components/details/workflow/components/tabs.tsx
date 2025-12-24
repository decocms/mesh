import {
  useCurrentStepTab,
  useCurrentStep,
  useTrackingExecutionId,
  useWorkflowActions,
  useCurrentTab,
  useCurrentStepName,
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
import { ArrowLeft, CodeXml, GitBranch, Loader2 } from "lucide-react";
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
import { ItemCard, ToolComponent } from "./tool-selector";
import { MentionItem } from "@/web/components/tiptap-mentions-input";
import { McpTool, useMcp } from "@/web/hooks/use-mcp";
import { useState } from "react";

function StepTabsList() {
  const activeTab = useCurrentStepTab();
  const { setCurrentStepTab } = useWorkflowActions();
  const selectedExecutionId = useTrackingExecutionId();
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

export function ExecutionBar({ executionId }: { executionId: string }) {
  const { setTrackingExecutionId } = useWorkflowActions();
  const { data } = useMembers();
  const trackingExecutionId = useTrackingExecutionId();
  const execution = useExecution(executionId);
  const isTrackingExecution = trackingExecutionId === executionId;
  if (!execution) return null;
  return (
    <div
      className={cn(
        "px-3 py-2.5 hover:bg-accent cursor-pointer transition-colors duration-150 w-full border-b border-border",
        isTrackingExecution && "bg-accent border-l-2 border-l-primary",
      )}
      onClick={() => setTrackingExecutionId(execution.id)}
    >
      <div className="w-full flex items-center gap-3">
        <div className="shrink-0">
          {execution.status === "success" && (
            <CheckCircle className="w-4 h-4 text-success" />
          )}
          {execution.status === "running" && (
            <Loader2 className="w-4 h-4 animate-spin text-warning" />
          )}
          {execution.status === "error" && (
            <XCircle className="w-4 h-4 text-destructive" />
          )}
          {execution.status === "enqueued" && (
            <Clock className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {new Date(execution.created_at).toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            {execution.id.slice(0, 8)}...
          </span>
        </div>
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          {
            data?.data?.members.find((m) => m.userId === execution.created_by)
              ?.user?.name
          }
        </span>
      </div>
    </div>
  );
}

export function WorkflowTabs() {
  const currentTab = useCurrentTab();
  const { setCurrentTab } = useWorkflowActions();
  return (
    <div className="bg-muted border border-border rounded-lg flex">
      <Button
        variant="outline"
        size="xs"
        className={cn(
          "h-7 border-0 text-foreground",
          currentTab !== "steps" && "bg-transparent text-muted-foreground",
        )}
        onClick={() => setCurrentTab("steps")}
      >
        <GitBranch className="w-4 h-4" />
      </Button>
      <Button
        variant="outline"
        size="xs"
        className={cn(
          "h-7 border-0 text-foreground",
          currentTab !== "code" && "bg-transparent text-muted-foreground",
        )}
        onClick={() => setCurrentTab("code")}
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
    ? step_results?.find((result) => result.step_id === currentStepName)?.output
    : pollingExecution?.output;

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
        code={JSON.stringify(output ?? null, null, 2)}
        language="json"
      />
    </div>
  );
}

export function StepTabs() {
  const activeTab = useCurrentStepTab();
  const { setCurrentStepTab, updateStep } = useWorkflowActions();
  const currentStep = useCurrentStep();
  const handleTabChange = (tab: "input" | "output" | "action") => {
    setCurrentStepTab(tab);
  };
  const selectedExecutionId = useTrackingExecutionId();
  const connection = useConnection(
    (currentStep?.action as ToolCallAction)?.connectionId ?? "",
  );
  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) =>
        handleTabChange(value as "input" | "output" | "action")
      }
      className="h-full w-full gap-0 bg-background"
    >
      {currentStep && (
        <div className="p-4 flex flex-col gap-4 mb-4 bg-background">
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
      )}
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

        {currentStep && activeTab === "action" && (
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
      <div className="h-[calc(100%-60px)] bg-background">
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
  onSelect,
}: {
  onSelect: (connectionId: string) => void;
}) {
  const connections = useConnections();
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col border-t border-border">
        {connections.map((connection) => (
          <ItemCard
            key={connection.id}
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
  const [tab, setTab] = useState<"connection" | "tool" | "input">("input");
  const { updateStep } = useWorkflowActions();
  const { tool } = useTool(
    stepAsTool?.action?.connectionId ?? "",
    stepAsTool?.action?.toolName ?? "",
  );

  return (
    <div className="w-full h-full flex flex-col">
      {tab === "connection" && (
        <div className="h-full flex flex-col">
          <ConnectionSelector
            onSelect={(connectionId) => {
              updateStep(stepAsTool.name, {
                action: { ...stepAsTool.action, connectionId },
              });
              setTab("tool");
            }}
          />
        </div>
      )}
      {tab === "tool" && (
        <div className="h-full flex flex-col">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTab("connection")}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <ToolSelector
            stepAsTool={stepAsTool}
            onSelect={(toolName) => {
              setTab("input");
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
      {tab === "input" && (
        <div className="h-full flex flex-col">
          <Button variant="outline" size="sm" onClick={() => setTab("tool")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
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
  const tool = tools.find((t) => t.name === toolName);
  const toolIcon = connection?.icon ?? null;
  const toolTitle = tool?.name;
  return (
    <div className="h-full flex flex-col">
      {toolTitle && (
        <ItemCard
          item={{
            icon: toolIcon,
            title: toolTitle,
          }}
        />
      )}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col border-t border-border">
        {tools
          .filter((t) => t.name !== toolName)
          .map((tool) => (
            <ItemCard
              key={tool.name}
              item={{
                icon: toolIcon,
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
    <div className="h-calc(100%-40px) overflow-scroll bg-background">
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
