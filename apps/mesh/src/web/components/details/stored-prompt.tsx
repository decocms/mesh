import {
  usePrompt,
  usePromptActions,
} from "@/web/hooks/collections/use-prompt";
import { ViewActions, ViewLayout } from "./layout";
import { Input } from "@deco/ui/components/input.tsx";
import { Textarea } from "@deco/ui/components/textarea.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { PinToSidebarButton } from "../pin-to-sidebar-button";
import { useRouterState } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { AgentAssignStrip } from "./agent-assign-strip";

const StoredPromptFormSchema = z.object({
  title: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  template: z.string().nullable(),
});

type StoredPromptForm = z.infer<typeof StoredPromptFormSchema>;

export function StoredPromptDetailsView({
  promptId,
  onBack,
}: {
  promptId: string;
  onBack: () => void;
}) {
  const prompt = usePrompt(promptId);
  const actions = usePromptActions();
  const isSaving = actions.update.isPending;
  const routerState = useRouterState();

  const form = useForm<StoredPromptForm>({
    resolver: zodResolver(StoredPromptFormSchema),
    values: prompt
      ? {
          title: prompt.title,
          name: prompt.name,
          description: prompt.description ?? null,
          template: prompt.template ?? "",
        }
      : undefined,
  });

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (!prompt) return;
    form.reset({
      title: prompt.title,
      name: prompt.name,
      description: prompt.description ?? null,
      template: prompt.template ?? "",
    });
  }, [prompt, form]);

  const computeVariablesFromTemplate = (template: string) => {
    const matches = Array.from(template.matchAll(/{{\s*([\w.-]+)\s*}}/g));
    const nextNames = Array.from(
      new Set(matches.map((m) => m[1]).filter(Boolean)),
    );
    return nextNames.map((name) => ({
      name,
      description: "",
      required: false,
    }));
  };

  const onSave = form.handleSubmit(async (data) => {
    const parsedArgs = computeVariablesFromTemplate(data.template ?? "");

    await actions.update.mutateAsync({
      id: promptId,
      data: {
        title: data.title,
        name: data.name,
        description: data.description,
        template: data.template ?? null,
        arguments: parsedArgs,
      },
    });
  });

  const url = routerState.location.href;

  if (!prompt) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-sm text-muted-foreground">Prompt not found</div>
      </div>
    );
  }

  return (
    <ViewLayout onBack={onBack}>
      <ViewActions>
        <PinToSidebarButton title={prompt.title} url={url} icon="description" />
        <Button size="sm" onClick={onSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </ViewActions>

      <div className="flex h-full">
        <div className="flex-1">
          <div className="flex flex-col gap-4 p-6 max-w-3xl">
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
              <div className="text-xs text-muted-foreground">Variables</div>
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {computeVariablesFromTemplate(form.watch("template") ?? "")
                  .map((variable) => variable.name)
                  .join(", ") || "No variables detected"}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Template</div>
              <Textarea
                {...form.register("template")}
                value={form.watch("template") ?? ""}
                rows={6}
                placeholder="Use {{variable}} placeholders"
                className="font-mono"
                onChange={(event) => {
                  form.setValue("template", event.target.value, {
                    shouldDirty: true,
                  });
                }}
              />
            </div>
          </div>
        </div>
        <AgentAssignStrip entityId={promptId} entityKind="prompt" />
      </div>
    </ViewLayout>
  );
}
