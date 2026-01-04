import type { ConnectionEntity } from "@/tools/connection/schema";
import { EnvVarsEditor } from "@/web/components/env-vars-editor";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { useAuthConfig } from "@/web/providers/auth-config-provider";
import { useProjectContext } from "@/web/providers/project-context-provider";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@deco/ui/components/form.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import { Container, Globe02, Terminal } from "@untitledui/icons";
import { formatDistanceToNow } from "date-fns";
import { useForm, useWatch } from "react-hook-form";
import { ConnectionGatewaysSection } from "./connection-gateways-section";
import { ConnectionPermissionsSection } from "./connection-permissions-section";
import type { ConnectionFormData } from "./schema";

/**
 * Connection fields component with conditional rendering based on ui_type
 */
function ConnectionFields({
  form,
  connection,
}: {
  form: ReturnType<typeof useForm<ConnectionFormData>>;
  connection: ConnectionEntity;
}) {
  const uiType = useWatch({ control: form.control, name: "ui_type" });
  const { stdioEnabled } = useAuthConfig();

  // Show STDIO options if:
  // 1. STDIO is enabled globally, OR
  // 2. The connection is already an STDIO type (allow viewing/editing existing connections)
  const showStdioOptions =
    stdioEnabled || connection.connection_type === "STDIO";

  return (
    <div className="flex flex-col gap-4 p-5 border-b border-border">
      {/* Connection Type Selector */}
      <FormField
        control={form.control}
        name="ui_type"
        render={({ field }) => (
          <FormItem className="flex flex-col gap-2">
            <FormLabel className="text-sm font-medium">Type</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger className="h-10 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="HTTP">
                  <span className="flex items-center gap-2">
                    <Globe02 className="w-4 h-4" />
                    HTTP
                  </span>
                </SelectItem>
                <SelectItem value="SSE">
                  <span className="flex items-center gap-2">
                    <Globe02 className="w-4 h-4" />
                    SSE
                  </span>
                </SelectItem>
                <SelectItem value="Websocket">
                  <span className="flex items-center gap-2">
                    <Globe02 className="w-4 h-4" />
                    Websocket
                  </span>
                </SelectItem>
                {showStdioOptions && (
                  <>
                    <SelectItem value="NPX">
                      <span className="flex items-center gap-2">
                        <Container className="w-4 h-4" />
                        NPX Package
                      </span>
                    </SelectItem>
                    <SelectItem value="STDIO">
                      <span className="flex items-center gap-2">
                        <Terminal className="w-4 h-4" />
                        Custom Command
                      </span>
                    </SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* NPX-specific fields */}
      {uiType === "NPX" && (
        <FormField
          control={form.control}
          name="npx_package"
          render={({ field }) => (
            <FormItem className="flex flex-col gap-2">
              <FormLabel className="text-sm font-medium">NPM Package</FormLabel>
              <FormControl>
                <Input
                  placeholder="@perplexity-ai/mcp-server"
                  {...field}
                  value={field.value || ""}
                  className="h-10 rounded-lg"
                />
              </FormControl>
              <p className="text-xs text-muted-foreground">
                The npm package to run with npx
              </p>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* STDIO/Custom Command fields */}
      {uiType === "STDIO" && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="stdio_command"
              render={({ field }) => (
                <FormItem className="flex flex-col gap-2">
                  <FormLabel className="text-sm font-medium">Command</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="node, bun, python..."
                      {...field}
                      value={field.value || ""}
                      className="h-10 rounded-lg"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="stdio_args"
              render={({ field }) => (
                <FormItem className="flex flex-col gap-2">
                  <FormLabel className="text-sm font-medium">
                    Arguments
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="arg1 arg2 --flag value"
                      {...field}
                      value={field.value || ""}
                      className="h-10 rounded-lg"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Space-separated arguments (no quotes needed)
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="stdio_cwd"
            render={({ field }) => (
              <FormItem className="flex flex-col gap-2">
                <FormLabel className="text-sm font-medium">
                  Working Directory
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="/path/to/project (optional)"
                    {...field}
                    value={field.value || ""}
                    className="h-10 rounded-lg"
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  Directory where the command will be executed
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        </>
      )}

      {/* Shared: Environment Variables for NPX and STDIO */}
      {(uiType === "NPX" || uiType === "STDIO") && (
        <FormField
          control={form.control}
          name="env_vars"
          render={({ field }) => (
            <FormItem className="flex flex-col gap-2">
              <FormLabel className="text-sm font-medium">
                Environment Variables
              </FormLabel>
              <FormControl>
                <EnvVarsEditor
                  value={field.value ?? []}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* HTTP/SSE/Websocket fields */}
      {uiType !== "NPX" && uiType !== "STDIO" && (
        <>
          <FormField
            control={form.control}
            name="connection_url"
            render={({ field }) => (
              <FormItem className="flex flex-col gap-2">
                <FormLabel className="text-sm font-medium">URL</FormLabel>
                <FormControl>
                  <Input
                    placeholder="https://example.com/mcp"
                    {...field}
                    value={field.value ?? ""}
                    className="h-10 rounded-lg"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

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
        </>
      )}
    </div>
  );
}

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
        <ConnectionFields form={form} connection={connection} />

        {/* Permissions section - for STDIO/NPX connections */}
        <ConnectionPermissionsSection form={form} />

        {/* Last Updated section */}
        <div className="flex items-center gap-4 p-5 border-b border-border">
          <span className="flex-1 text-sm text-foreground">Last Updated</span>
          <span className="text-muted-foreground uppercase text-xs">
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
