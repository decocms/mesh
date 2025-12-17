import {
  useCurrentStepTab,
  useCurrentStep,
  useDraftStep,
  useIsAddingStep,
  useTrackingExecutionId,
  useWorkflowActions,
  useCurrentTab,
  useWorkflowSteps,
} from "@/web/components/details/workflow/stores/workflow";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@deco/ui/components/tabs.js";
import { cn } from "@deco/ui/lib/utils.js";
import { useEffect, useState } from "react";
import {
  CodeAction,
  SleepAction,
  Step,
  ToolCallAction,
  WaitForSignalAction,
} from "@decocms/bindings/workflow";
import { MonacoCodeEditor } from "./monaco-editor";
import { ConnectionSelector, ItemCard, ToolSelector } from "./tool-selector";
import { Button } from "@deco/ui/components/button.js";
import { CodeXml, GitBranch, Loader2 } from "lucide-react";
import { useConnection, useConnections } from "@/web/hooks/collections/use-connection";
import { usePollingWorkflowExecution } from "../hooks/use-workflow-collection-item";
import { MentionItem } from "@/web/components/tiptap-mentions-input";
import { useCollectionItem } from "@/web/hooks/use-collections";
import { ExecutionResult, ToolDetail } from "./tool";
import { useMcp } from "use-mcp/react";

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
  const steps = useWorkflowSteps();
  const step = steps.find((s) => s.name === stepId);
  const isForEachStep = step?.config?.loop?.for !== undefined;
  if (isForEachStep) {
    const results = pollingExecution?.step_results
      .filter((s) => s.step_id.startsWith(stepId + "["))
      .map((s) => [s.step_id, s.output]);
    if (!results) return null;
    return Object.fromEntries(results);
  }
  return pollingExecution?.step_results.find((s) => s.step_id === stepId);
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
      <ExecutionResult
        executionResult={stepResult.output as Record<string, unknown> | null}
        placeholder="No output available"
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

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) =>
        handleTabChange(value as "input" | "output" | "action")
      }
      className="w-1/3 h-full bg-sidebar border-l border-border gap-0"
    >
      <TabsList className="w-full rounded-none bg-transparent p-0 h-10">
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
    action: ToolCallAction | CodeAction | SleepAction | WaitForSignalAction;
  };
}) {
  const { updateStep } = useWorkflowActions();
  if ("toolName" in step.action) {
    return (
      <ToolAction
        key={step.name}
        step={step as Step & { action: ToolCallAction }}
      />
    );
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
  } else if ("sleepMs" in step.action || "sleepUntil" in step.action) {
    return (
      <MonacoCodeEditor
        key={`sleep-${step.name}`}
        height="100%"
        code={JSON.stringify(step.action, null, 2)}
        language="json"
        onSave={(action) => {
          updateStep(step.name, {
            action: JSON.parse(action) as SleepAction,
          });
        }}
      />
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

function ToolAction({ step }: { step: Step & { action: ToolCallAction } }) {
  const connectionId = step.action.connectionId;
  const toolName = step.action.toolName;
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(connectionId ?? null);
  const [isUsingTool, setIsUsingTool] = useState(!!toolName);
  const { updateStep, setDraftStep } = useWorkflowActions();
  const currentStep = useCurrentStep();
  const isAddingStep = useIsAddingStep();
  const connections = useConnections();
  const draftStep = useDraftStep();

  const handleToolSelect = (newToolName: string | null) => {
    if (!selectedConnectionId || !newToolName) return;
    setIsUsingTool(true);

    // Get the tool's outputSchema from the connection
    const tool = connections
      .find((c) => c.id === selectedConnectionId)
      ?.tools?.find((t) => t.name === newToolName);
    const outputSchema =
      (tool?.outputSchema as Record<string, unknown>) ?? null;

    const newAction: ToolCallAction = {
      toolName: newToolName,
      connectionId: selectedConnectionId,
    };

    if (isAddingStep && draftStep) {
      // Update draft step
      setDraftStep({
        ...draftStep,
        action: newAction,
        outputSchema,
      });
    } else if (currentStep?.name) {
      // Update existing step
      updateStep(currentStep.name, {
        action: newAction,
        outputSchema,
      });
    }
  };

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      <div className="">
        {(!selectedConnectionId || !isUsingTool) && (
          <ConnectionSelector
            selectedConnectionId={selectedConnectionId}
            onConnectionSelect={(connectionId) => {
              setSelectedConnectionId(connectionId);
            }}
          />
        )}
        {!isUsingTool && selectedConnectionId && (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col border-t border-border">
            <div onClick={() => setSelectedConnectionId(null)}>
              <ItemCard
                item={{
                  icon: null,
                  title:
                    connections.find((c) => c.id === selectedConnectionId)
                      ?.title ?? selectedConnectionId,
                }}
                selected={true}
                backButton={true}
              />
            </div>
            <ToolSelector
              selectedConnectionId={selectedConnectionId}
              selectedToolName={toolName}
              onToolNameChange={handleToolSelect}
            />
          </div>
        )}
      </div>
      {toolName && isUsingTool && (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col border-t border-border">
          <SelectedTool
            selectedToolName={toolName}
            selectedConnectionId={
              selectedConnectionId ?? step.action.connectionId
            }
            input={step.input ?? {}}
            onBack={() => {
              setIsUsingTool(false);
            }}
          />
        </div>
      )}
    </div>
  );
}


export function useTool(toolName: string, connectionId: string) {
  const connection = useConnection(connectionId);
  // Use proxy URL when connection has a token (OAuth completed)
  // Use normalizedUrl directly when no token (OAuth flow needs direct access)
  const mcpProxyUrl = new URL(`/mcp/${connectionId}`, window.location.origin);

  // Initialize MCP client
  const mcp = useMcp({
    url: mcpProxyUrl.href,
    clientName: "MCP Tool Inspector",
    clientUri: window.location.origin,
    autoReconnect: true,
    autoRetry: 5000,
  });

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (mcp.error) {
      console.error("MCP Error:", mcp.error);
    }
  }, [mcp.error]);

  // Find the tool definition
  const tool = mcp.tools?.find((t) => t.name === toolName);

  // Check if MCP is still loading/discovering
  const isLoading =
    mcp.state === "connecting" ||
    mcp.state === "authenticating" ||
    mcp.state === "discovering";

  return {
    tool,
    mcp,
    connection,
    isLoading,
  };
}

function SelectedTool({
  selectedToolName,
  selectedConnectionId,
  input,
  onBack
}: {
  selectedToolName: string;
  selectedConnectionId: string;
  input: Record<string, unknown>;
  onBack: () => void;
}) {
  const { updateStep } = useWorkflowActions();
  const currentStep = useCurrentStep();
  const workflowSteps = useWorkflowSteps();
  const { tool, mcp, connection, isLoading } = useTool(selectedToolName, selectedConnectionId);
  const handleInputChange = (input: Record<string, unknown>) => {
    if (!currentStep?.name) return;
    const recursivelyParseIfObjectOrArray = (
      input: Record<string, unknown>,
    ): Record<string, unknown> => {
      return Object.fromEntries(
        Object.entries(input).map(([key, value]) => {
          if (typeof value === "object" && value !== null) {
            return [
              key,
              recursivelyParseIfObjectOrArray(value as Record<string, unknown>),
            ];
          }
          let parsedValue = value;
          try {
            parsedValue = JSON.parse(value as string);
          } catch {
            // Do nothing
          }
          return [key, parsedValue];
        }),
      );
    };
    const parsedInput = recursivelyParseIfObjectOrArray(input);
    updateStep(currentStep.name, {
      input: {
        ...(currentStep?.input ?? {}),
        ...parsedInput,
      } as Record<string, unknown>,
    });
  };

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
      <div className="flex flex-col items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground text-sm">Loading tool...</p>
      </div>
    );
  }

  return (
    <div className="h-full">
<ToolDetail
tool={tool}
mcp={mcp}
connection={connection}
onInputChange={handleInputChange}
initialInputParams={input}
mentions={allMentions}
onBack={onBack}
/>      
    </div>
  );
}
