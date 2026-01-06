/**
 * Toolbox Settings Page
 *
 * Configure toolbox settings: name, icon, and strategy.
 */

import { ErrorBoundary } from "@/web/components/error-boundary";
import { useToolboxContext } from "@/web/providers/toolbox-context-provider";
import { useGatewayActions } from "@/web/hooks/collections/use-gateway";
import { CollectionHeader } from "@/web/components/collections/collection-header";
import { CollectionPage } from "@/web/components/collections/collection-page";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Textarea } from "@deco/ui/components/textarea.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@deco/ui/components/form.tsx";
import { Loading01 } from "@untitledui/icons";
import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import type { GatewayToolSelectionStrategy } from "@/tools/gateway/schema";

const settingsFormSchema = z.object({
  title: z.string().min(1, "Name is required").max(255),
  description: z.string().nullable().optional(),
  tool_selection_strategy: z.enum([
    "passthrough",
    "smart_tool_selection",
    "code_execution",
  ]),
  tool_selection_mode: z.enum(["inclusion", "exclusion"]),
});

type SettingsFormData = z.infer<typeof settingsFormSchema>;

function ToolboxSettingsContent() {
  const { toolbox } = useToolboxContext();
  const actions = useGatewayActions();

  const form = useForm<SettingsFormData>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      title: toolbox.title,
      description: toolbox.description,
      tool_selection_strategy: toolbox.tool_selection_strategy,
      tool_selection_mode: toolbox.tool_selection_mode,
    },
  });

  const onSubmit = async (data: SettingsFormData) => {
    try {
      await actions.update.mutateAsync({
        id: toolbox.id,
        data: {
          title: data.title,
          description: data.description || null,
          tool_selection_strategy:
            data.tool_selection_strategy as GatewayToolSelectionStrategy,
          tool_selection_mode: data.tool_selection_mode,
        },
      });
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    }
  };

  return (
    <CollectionPage>
      <CollectionHeader title="Settings" />

      <div className="flex-1 overflow-auto p-5">
        <div className="max-w-xl">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="My Toolbox" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="A brief description of this toolbox"
                        rows={3}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tool_selection_strategy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Strategy</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="passthrough">Passthrough</SelectItem>
                        <SelectItem value="smart_tool_selection">
                          Smart Tool Selection
                        </SelectItem>
                        <SelectItem value="code_execution">
                          Code Execution
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      How tools are selected and invoked
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tool_selection_mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Selection Mode</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="inclusion">
                          Include Selected
                        </SelectItem>
                        <SelectItem value="exclusion">
                          Exclude Selected
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Include or exclude selected connections and tools
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={
                  form.formState.isSubmitting || !form.formState.isDirty
                }
              >
                {form.formState.isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </CollectionPage>
  );
}

export default function ToolboxSettings() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <Loading01
              size={32}
              className="animate-spin text-muted-foreground"
            />
          </div>
        }
      >
        <ToolboxSettingsContent />
      </Suspense>
    </ErrorBoundary>
  );
}
