import type { ConnectionEntity } from "@/tools/connection/schema";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@deco/ui/components/form.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import { formatDistanceToNow } from "date-fns";
import { useForm } from "react-hook-form";
import { ConnectionGatewaysSection } from "./connection-gateways-section";
import type { ConnectionFormData } from "./schema";

export function ConnectionSettingsFormUI({
  form,
  connection,
}: {
  form: ReturnType<typeof useForm<ConnectionFormData>>;
  connection: ConnectionEntity;
}) {
  const { org } = useProjectContext();

  return (
    <Form {...form}>
      <div className="flex flex-col">
        {/* Header section - Icon, Title, Description */}
        <div className="flex flex-col gap-4 p-5 border-b border-border">
          <IntegrationIcon
            icon={connection.icon}
            name={connection.title}
            size="lg"
            className="shadow-sm"
          />
          <div className="flex flex-col">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem className="w-full space-y-0">
                  <div className="flex items-center gap-2.5">
                    <FormControl>
                      <Input
                        {...field}
                        className="h-auto text-lg! font-medium leading-7 px-0 border-transparent hover:border-input focus:border-input bg-transparent transition-all"
                        placeholder="Connection Name"
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="w-full space-y-0">
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value || ""}
                      className="h-auto text-base text-muted-foreground leading-6 px-0 border-transparent hover:border-input focus:border-input bg-transparent transition-all"
                      placeholder="Add a description..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Connection section */}
        <div className="flex flex-col gap-4 p-5 border-b border-border">
          <div className="flex flex-col gap-2">
            <FormLabel className="text-sm font-medium">Connection</FormLabel>
            <div className="flex">
              <FormField
                control={form.control}
                name="connection_type"
                render={({ field }) => (
                  <FormItem className="space-y-0">
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="h-10 rounded-r-none border-r-0 bg-muted focus:ring-0 focus:ring-offset-0 rounded-l-lg">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="HTTP">HTTP</SelectItem>
                        <SelectItem value="SSE">SSE</SelectItem>
                        <SelectItem value="Websocket">Websocket</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="connection_url"
                render={({ field }) => (
                  <FormItem className="flex-1 space-y-0">
                    <FormControl>
                      <Input
                        placeholder="https://example.com/mcp"
                        {...field}
                        className="h-10 rounded-l-none rounded-r-xl focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="connection_type"
              render={() => <FormMessage />}
            />
            <FormField
              control={form.control}
              name="connection_url"
              render={() => <FormMessage />}
            />
          </div>

          <FormField
            control={form.control}
            name="connection_token"
            render={({ field }) => (
              <FormItem className="flex flex-col gap-2">
                <FormLabel className="text-sm font-medium">Token</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder={
                      connection.connection_token
                        ? "••••••••"
                        : "Enter access token..."
                    }
                    {...field}
                    value={field.value || ""}
                    className="h-10 rounded-lg"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Last Updated section */}
        <div className="flex items-center gap-4 p-5 border-b border-border">
          <span className="flex-1 text-sm text-foreground">Last Updated</span>
          <span className="font-mono text-sm uppercase text-muted-foreground">
            {connection.updated_at
              ? formatDistanceToNow(new Date(connection.updated_at), {
                  addSuffix: false,
                })
              : "Unknown"}
          </span>
        </div>

        {/* Gateways section */}
        <ConnectionGatewaysSection
          connectionId={connection.id}
          connectionTitle={connection.title}
          connectionDescription={connection.description}
          connectionIcon={connection.icon}
          org={org.slug}
        />
      </div>
    </Form>
  );
}


