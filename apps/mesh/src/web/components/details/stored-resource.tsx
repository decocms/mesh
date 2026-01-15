import {
  useResource,
  useResourceActions,
} from "@/web/hooks/collections/use-resource";
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

const StoredResourceFormSchema = z.object({
  title: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  uri: z.string().min(1),
  mime_type: z.string().nullable(),
  text: z.string().nullable(),
  blob: z.string().nullable(),
});

type StoredResourceForm = z.infer<typeof StoredResourceFormSchema>;

export function StoredResourceDetailsView({
  resourceId,
  onBack,
}: {
  resourceId: string;
  onBack: () => void;
}) {
  const resource = useResource(resourceId);
  const actions = useResourceActions();
  const isSaving = actions.update.isPending;
  const routerState = useRouterState();

  const form = useForm<StoredResourceForm>({
    resolver: zodResolver(StoredResourceFormSchema),
    values: resource
      ? {
          title: resource.title,
          name: resource.name,
          description: resource.description ?? null,
          uri: resource.uri,
          mime_type: resource.mime_type ?? null,
          text: resource.text ?? null,
          blob: resource.blob ?? null,
        }
      : undefined,
  });

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (!resource) return;
    form.reset({
      title: resource.title,
      name: resource.name,
      description: resource.description ?? null,
      uri: resource.uri,
      mime_type: resource.mime_type ?? null,
      text: resource.text ?? null,
      blob: resource.blob ?? null,
    });
  }, [resource, form]);

  const onSave = form.handleSubmit(async (data) => {
    await actions.update.mutateAsync({
      id: resourceId,
      data: {
        title: data.title,
        name: data.name,
        description: data.description,
        uri: data.uri,
        mime_type: data.mime_type,
        text: data.text,
        blob: data.blob,
      },
    });
  });

  const url = routerState.location.href;

  if (!resource) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-sm text-muted-foreground">Resource not found</div>
      </div>
    );
  }

  return (
    <ViewLayout onBack={onBack}>
      <ViewActions>
        <PinToSidebarButton title={resource.title} url={url} icon="files" />
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
              <Input {...form.register("name")} />
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
              <div className="text-xs text-muted-foreground">URI</div>
              <Input {...form.register("uri")} className="font-mono" />
            </div>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">MIME type</div>
              <Input {...form.register("mime_type")} />
            </div>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Text</div>
              <Textarea {...form.register("text")} rows={4} />
            </div>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Blob (base64)</div>
              <Textarea {...form.register("blob")} rows={4} />
            </div>
          </div>
        </div>
        <AgentAssignStrip entityId={resourceId} entityKind="resource" />
      </div>
    </ViewLayout>
  );
}
