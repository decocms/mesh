import {
  useCurrentStepTab,
  useCurrentStep,
  useTrackingExecutionId,
  useWorkflowActions,
  useCurrentTab,
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
import { useConnection } from "@/web/hooks/collections/use-connection";
import { usePollingWorkflowExecution } from "../hooks/use-workflow-collection-item";
import { useWorkflow } from "@/web/components/details/workflow/stores/workflow";
import { CheckCircle, Clock, XCircle } from "lucide-react";

import { useWorkflowExecutionCollectionList } from "../hooks/use-workflow-collection-item";
import { ScrollArea } from "@deco/ui/components/scroll-area.tsx";
import { useMembers } from "@/web/hooks/use-members";
import { Avatar } from "@deco/ui/components/avatar.tsx";

function StepTabsList() {
  const activeTab = useCurrentStepTab();
  const { setCurrentStepTab } = useWorkflowActions();
  const selectedExecutionId = useTrackingExecutionId();
  return (
    <TabsList className="w-full rounded-none bg-transparent p-0">
      <TabsTrigger
        className={cn(
          "border-0 border-b border-border p-0 h-full rounded-none w-full",
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
            "border-0 border-b border-border p-0 h-full rounded-none w-full",
            activeTab === "output" && "border-foreground",
          )}
          value="output"
          onClick={() => setCurrentStepTab("output")}
        >
          Output
        </TabsTrigger>
      )}
      <TabsTrigger
        className={cn(
          "border-0 border-b border-border p-0 h-full rounded-none w-full",
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

function useToolInfo(step: Step | undefined) {
  if (step && "toolName" in step.action && "connectionId" in step.action) {
    return {
      toolName: step.action.toolName,
      connectionId: step.action.connectionId,
    };
  }
  return null;
}

export function ExecutionsTab() {
  const workflow = useWorkflow();
  const { list: executions } = useWorkflowExecutionCollectionList({
    workflowId: workflow.id,
  });
  const trackingExecutionId = useTrackingExecutionId();
  const { setTrackingExecutionId } = useWorkflowActions();
  const { data } = useMembers();
  return (
    <div className="h-full w-full">
      <ScrollArea className="flex flex-col">
        {executions.map((execution) => {
          const isTrackingExecution = trackingExecutionId === execution.id;
          return (
            <div
              key={execution.id}
              className={cn(
                "border-b border-border pb-2 pt-2 hover:bg-muted cursor-pointer transition-colors duration-200 w-full",
                isTrackingExecution && "bg-muted",
              )}
              onClick={() => setTrackingExecutionId(execution.id)}
            >
              <div className="px-2 w-full flex items-center justify-between text-left gap-3">
                <div>
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
                <div className="flex-1 flex items-center gap-3">
                  <p className="text-sm font-medium">
                    {new Date(execution.created_at).toLocaleString()}
                  </p>
                  <p className="text-xs font-medium text-left text-muted-foreground">
                    {execution.id}
                  </p>
                </div>

                {/* {execution.start_at_epoch_ms && <p className="text-sm font-medium">
              {new Date(execution.start_at_epoch_ms).toLocaleString()}
            </p>} */}
                <p className="text-sm font-medium">
                  {
                    data?.data?.members.find(
                      (m) => m.userId === execution.created_by,
                    )?.user?.name
                  }
                </p>

                {/* <p className="text-sm font-medium">
              {execution.completed_at_epoch_ms && new Date(execution.completed_at_epoch_ms).toLocaleString()}
            </p> */}
              </div>
            </div>
          );
        })}
      </ScrollArea>
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

function useStepResult(executionId: string, stepId: string) {
  const { item: pollingExecution } = usePollingWorkflowExecution(executionId);
  return pollingExecution?.step_results.find((s) => s.stepId === stepId);
}

function OutputTabContent({
  executionId,
  stepId,
}: {
  executionId: string;
  stepId: string;
}) {
  const stepResult = useStepResult(executionId, stepId);
  if (!stepResult) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground text-sm">Loading execution...</p>
      </div>
    );
  }
  return (
    <div className="h-full">
      <MonacoCodeEditor
        height="100%"
        code={JSON.stringify(stepResult.output, null, 2)}
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
  const toolInfo = useToolInfo(currentStep);
  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) =>
        handleTabChange(value as "input" | "output" | "action")
      }
      className="h-full w-full"
    >
      <div className="p-4 flex flex-col gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Avatar
            url={connection?.icon ?? ""}
            fallback={currentStep?.name?.charAt(0) ?? ""}
          />
          <p className="text-sm font-medium">
            {currentStep?.name ?? connection?.title ?? toolInfo?.toolName ?? ""}
          </p>
        </div>
        <p className="text-muted-foreground text-xs">
          {currentStep?.description ?? connection?.description ?? ""}
        </p>
      </div>
      <div className="h-10">
        <StepTabsList />
      </div>
      <TabsContent className="flex-1 h-[calc(100%-40px)]" value={activeTab}>
        {currentStep && activeTab === "output" && selectedExecutionId && (
          <div className="h-full">
            <OutputTabContent
              executionId={selectedExecutionId}
              stepId={currentStep.name}
            />
          </div>
        )}
        {currentStep && activeTab === "input" && (
          <MonacoCodeEditor
            key={`input-${currentStep.name}`}
            height="100%"
            code={JSON.stringify(currentStep.input ?? {}, null, 2)}
            language="json"
            onSave={(input) => {
              updateStep(currentStep.name, {
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
    return <div className="h-[calc(100%-60px)]">Tool Action Here</div>;
  } else if ("code" in step.action) {
    return (
      <div className="h-[calc(100%-60px)]">
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
