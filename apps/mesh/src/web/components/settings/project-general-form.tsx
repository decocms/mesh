import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useProjectContext,
  useMCPClient,
  SELF_MCP_ALIAS_ID,
  ORG_ADMIN_PROJECT_SLUG,
} from "@decocms/mesh-sdk";
import { KEYS } from "@/web/lib/query-keys";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Textarea } from "@deco/ui/components/textarea.tsx";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@deco/ui/components/form.tsx";
import { toast } from "sonner";

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name is too long"),
  description: z.string().max(1000, "Description is too long").nullable(),
});

type FormData = z.infer<typeof formSchema>;

type ProjectUpdateOutput = {
  project: {
    id: string;
    organizationId: string;
    slug: string;
    name: string;
    description: string | null;
    enabledPlugins: string[] | null;
  } | null;
};

export function ProjectGeneralForm() {
  const { org, project } = useProjectContext();
  const queryClient = useQueryClient();
  const isOrgAdmin = project.slug === ORG_ADMIN_PROJECT_SLUG;

  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    values: {
      name: project.name ?? "",
      description: project.description ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const result = (await client.callTool({
        name: "PROJECT_UPDATE",
        arguments: {
          projectId: project.id,
          name: data.name,
          description: data.description || null,
        },
      })) as { structuredContent?: unknown };
      return (result.structuredContent ?? result) as ProjectUpdateOutput;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.project(org.id, project.slug),
      });
      queryClient.invalidateQueries({
        queryKey: KEYS.projects(org.id),
      });
      toast.success("Project updated successfully");
      form.reset(form.getValues());
    },
    onError: (error) => {
      toast.error(
        "Failed to update project: " +
          (error instanceof Error ? error.message : "Unknown error"),
      );
    },
  });

  const onSubmit = async (data: FormData) => {
    await mutation.mutateAsync(data);
  };

  const hasChanges = form.formState.isDirty;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Project Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="My Project"
                  {...field}
                  disabled={isOrgAdmin || mutation.isPending}
                />
              </FormControl>
              {isOrgAdmin && (
                <FormDescription>
                  The organization admin project name cannot be changed.
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormItem>
          <FormLabel>Slug</FormLabel>
          <FormControl>
            <Input value={project.slug} disabled className="bg-muted" />
          </FormControl>
          <FormDescription>
            The project slug cannot be changed after creation.
          </FormDescription>
        </FormItem>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Optional project description..."
                  rows={3}
                  {...field}
                  value={field.value ?? ""}
                  disabled={mutation.isPending}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center gap-3 pt-4">
          <Button
            type="submit"
            disabled={!hasChanges || mutation.isPending}
            className="min-w-24"
          >
            {mutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
          {hasChanges && (
            <Button
              type="button"
              variant="outline"
              onClick={() => form.reset()}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
