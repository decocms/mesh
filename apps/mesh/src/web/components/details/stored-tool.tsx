import { useTool, useToolActions } from "@/web/hooks/collections/use-tool";
import { AgentAssignStrip } from "./agent-assign-strip";
import { ViewActions, ViewLayout } from "./layout";
import { Input } from "@deco/ui/components/input.tsx";
import { Textarea } from "@deco/ui/components/textarea.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { MonacoCodeEditor } from "./workflow/components/monaco-editor";
import { PinToSidebarButton } from "../pin-to-sidebar-button";
import { useRouterState } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { createToolCaller } from "@/tools/client";

const StoredToolFormSchema = z.object({
  title: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  execute: z.string().min(1),
  dependencies: z.array(z.string()),
});

type StoredToolForm = z.infer<typeof StoredToolFormSchema>;

export function StoredToolDetailsView({
  toolId,
  onBack,
}: {
  toolId: string;
  onBack: () => void;
}) {
  const tool = useTool(toolId);
  const actions = useToolActions();
  const isSaving = actions.update.isPending;
  const routerState = useRouterState();
  const toolCaller = createToolCaller();
  const [execInput, setExecInput] = useState<string>("{}");
  const [execResult, setExecResult] = useState<unknown>(null);
  const [execError, setExecError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const form = useForm<StoredToolForm>({
    resolver: zodResolver(StoredToolFormSchema),
    defaultValues: {
      dependencies: [],
    },
    values: tool
      ? {
          title: tool.title,
          name: tool.name,
          description: tool.description ?? null,
          execute: tool.execute,
          dependencies: tool.dependencies,
        }
      : undefined,
  });

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (!tool) return;
    form.reset({
      title: tool.title,
      name: tool.name,
      description: tool.description ?? null,
      execute: tool.execute,
      dependencies: tool.dependencies,
    });
  }, [tool, form]);

  const onSave = form.handleSubmit(async (data) => {
    await actions.update.mutateAsync({
      id: toolId,
      data: {
        title: data.title,
        name: data.name,
        description: data.description,
        execute: data.execute,
        dependencies: data.dependencies,
      },
    });
  });

  const url = routerState.location.href;

  const handleExecute = async () => {
    if (!tool) return;
    setIsExecuting(true);
    setExecError(null);
    setExecResult(null);

    try {
      const parsed = execInput.trim() ? JSON.parse(execInput) : {};
      if (parsed && typeof parsed !== "object") {
        throw new Error("Parameters must be a JSON object.");
      }

      const result = await toolCaller(tool.name, parsed);
      setExecResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExecError(message);
    } finally {
      setIsExecuting(false);
    }
  };

  if (!tool) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-sm text-muted-foreground">Tool not found</div>
      </div>
    );
  }

  return (
    <ViewLayout onBack={onBack}>
      <ViewActions>
        <PinToSidebarButton title={tool.title} url={url} icon="build" />
        <Button size="sm" onClick={onSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </ViewActions>

      <div className="flex h-full">
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 h-full">
          <div className="flex flex-col gap-4 p-6 border-r border-border overflow-auto">
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Title</div>
              <Input {...form.register("title")} />
            </div>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Name</div>
              <Input {...form.register("name")} className="font-mono" />
            </div>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Description</div>
              <Textarea
                {...form.register("description")}
                value={form.watch("description") ?? ""}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Dependencies</div>
              <div className="flex flex-col gap-2">
                {(form.watch("dependencies") ?? []).map((dependency, index) => (
                  <div
                    key={`${dependency}-${index}`}
                    className="flex items-center gap-2"
                  >
                    <Input
                      value={dependency}
                      onChange={(event) => {
                        const next = [
                          ...(form.getValues("dependencies") ?? []),
                        ];
                        next[index] = event.target.value;
                        form.setValue("dependencies", next, {
                          shouldDirty: true,
                        });
                      }}
                      placeholder="tool_id"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const next = [
                          ...(form.getValues("dependencies") ?? []),
                        ];
                        next.splice(index, 1);
                        form.setValue("dependencies", next, {
                          shouldDirty: true,
                        });
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = [...(form.getValues("dependencies") ?? [])];
                    next.push("");
                    form.setValue("dependencies", next, { shouldDirty: true });
                  }}
                >
                  Add dependency
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-semibold text-foreground">
                Execute tool
              </div>
              <p className="text-xs text-muted-foreground">
                Provide parameters as JSON and execute via Mesh MCP.
              </p>
              <Textarea
                value={execInput}
                onChange={(event) => setExecInput(event.target.value)}
                rows={4}
                className="font-mono text-xs"
                placeholder='{"key":"value"}'
              />
              <Button size="sm" onClick={handleExecute} disabled={isExecuting}>
                {isExecuting ? "Executing..." : "Execute tool"}
              </Button>
              {execError ? (
                <div className="text-xs text-destructive">{execError}</div>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col h-full overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <div className="text-sm font-semibold text-foreground">
                Execute (JavaScript)
              </div>
              <p className="text-xs text-muted-foreground">
                Use global <span className="font-mono">input</span> for
                arguments and <span className="font-mono">tools</span> to call
                other tools.
              </p>
            </div>
            <div className="flex-1 grid grid-rows-[1fr_auto] overflow-hidden">
              <MonacoCodeEditor
                code={form.watch("execute")}
                language="javascript"
                height="100%"
                onChange={(value) =>
                  form.setValue("execute", value ?? "", { shouldDirty: true })
                }
              />
              {execResult !== null ? (
                <div className="border-t border-border px-4 py-3 bg-muted/20">
                  <div className="text-xs font-semibold text-muted-foreground mb-2">
                    Result
                  </div>
                  <MonacoCodeEditor
                    code={JSON.stringify(execResult, null, 2)}
                    language="json"
                    height="160px"
                    readOnly
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <AgentAssignStrip entityId={toolId} entityKind="tool" />
      </div>
    </ViewLayout>
  );
}
