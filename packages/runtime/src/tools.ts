/* oxlint-disable no-explicit-any */
/* oxlint-disable ban-types */
import { HttpServerTransport } from "@deco/mcp/http";
import {
  OnEventsInputSchema,
  OnEventsOutputSchema,
  type EventBusBindingClient,
} from "@decocms/bindings";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Event, type EventHandlers } from "./events.ts";
import type { DefaultEnv } from "./index.ts";
import { State } from "./state.ts";
import { Binding } from "./wrangler.ts";

// Re-export EventHandlers type for external use
export type { EventHandlers } from "./events.ts";

export const createRuntimeContext = (prev?: AppContext) => {
  const store = State.getStore();
  if (!store) {
    if (prev) {
      return prev;
    }
    throw new Error("Missing context, did you forget to call State.bind?");
  }
  return store;
};

export interface ToolExecutionContext<
  TSchemaIn extends z.ZodTypeAny = z.ZodTypeAny,
> {
  context: z.infer<TSchemaIn>;
  runtimeContext: AppContext;
}

/**
 * Tool interface with generic schema types for type-safe tool creation.
 */
export interface Tool<
  TSchemaIn extends z.ZodTypeAny = z.ZodTypeAny,
  TSchemaOut extends z.ZodTypeAny | undefined = undefined,
> {
  id: string;
  description?: string;
  inputSchema: TSchemaIn;
  outputSchema?: TSchemaOut;
  execute(
    context: ToolExecutionContext<TSchemaIn>,
  ): TSchemaOut extends z.ZodSchema
    ? Promise<z.infer<TSchemaOut>>
    : Promise<unknown>;
}

/**
 * Streamable tool interface for tools that return Response streams.
 */
export interface StreamableTool<TSchemaIn extends z.ZodSchema = z.ZodSchema> {
  id: string;
  inputSchema: TSchemaIn;
  streamable?: true;
  description?: string;
  execute(input: ToolExecutionContext<TSchemaIn>): Promise<Response>;
}

/**
 * CreatedTool is a permissive type that any Tool or StreamableTool can be assigned to.
 * Uses a structural type with relaxed execute signature to allow tools with any schema.
 */
export type CreatedTool = {
  id: string;
  description?: string;
  inputSchema: z.ZodTypeAny;
  outputSchema?: z.ZodTypeAny;
  streamable?: true;
  // Use a permissive execute signature - accepts any context shape
  execute(context: {
    context: unknown;
    runtimeContext: AppContext;
  }): Promise<unknown>;
};

/**
 * creates a private tool that always ensure for athentication before being executed
 */
export function createPrivateTool<
  TSchemaIn extends z.ZodSchema = z.ZodSchema,
  TSchemaOut extends z.ZodSchema | undefined = undefined,
>(opts: Tool<TSchemaIn, TSchemaOut>): Tool<TSchemaIn, TSchemaOut> {
  const execute = opts.execute;
  if (typeof execute === "function") {
    opts.execute = (input: ToolExecutionContext<TSchemaIn>) => {
      const env = input.runtimeContext.env;
      if (env) {
        env.MESH_REQUEST_CONTEXT?.ensureAuthenticated();
      }
      return execute(input);
    };
  }
  return createTool(opts);
}

export function createStreamableTool<
  TSchemaIn extends z.ZodSchema = z.ZodSchema,
>(streamableTool: StreamableTool<TSchemaIn>): StreamableTool<TSchemaIn> {
  return {
    ...streamableTool,
    execute: (input: ToolExecutionContext<TSchemaIn>) => {
      const env = input.runtimeContext.env;
      if (env) {
        env.MESH_REQUEST_CONTEXT?.ensureAuthenticated();
      }
      return streamableTool.execute({
        ...input,
        runtimeContext: createRuntimeContext(input.runtimeContext),
      });
    },
  };
}

export function createTool<
  TSchemaIn extends z.ZodSchema = z.ZodSchema,
  TSchemaOut extends z.ZodSchema | undefined = undefined,
>(opts: Tool<TSchemaIn, TSchemaOut>): Tool<TSchemaIn, TSchemaOut> {
  return {
    ...opts,
    execute: (input: ToolExecutionContext<TSchemaIn>) => {
      return opts.execute({
        ...input,
        runtimeContext: createRuntimeContext(input.runtimeContext),
      });
    },
  };
}

export interface ViewExport {
  title: string;
  icon: string;
  url: string;
  tools?: string[];
  rules?: string[];
  installBehavior?: "none" | "open" | "autoPin";
}

export interface Integration {
  id: string;
  appId: string;
}

export function isStreamableTool(
  tool: CreatedTool,
): tool is StreamableTool & CreatedTool {
  return tool && "streamable" in tool && tool.streamable === true;
}

export interface OnChangeCallback<TSchema extends z.ZodTypeAny = never> {
  state: z.infer<TSchema>;
  scopes: string[];
}

export interface OAuthParams {
  code: string;
  code_verifier?: string;
  code_challenge_method?: "S256" | "plain";
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  [key: string]: unknown;
}

/**
 * OAuth client for dynamic client registration (RFC7591)
 */
export interface OAuthClient {
  client_id: string;
  client_secret?: string;
  client_name?: string;
  redirect_uris: string[];
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
  scope?: string;
  client_id_issued_at?: number;
  client_secret_expires_at?: number;
}

/**
 * OAuth configuration for MCP servers implementing PKCE flow
 * Per MCP Authorization spec: https://modelcontextprotocol.io/specification/draft/basic/authorization
 */
export interface OAuthConfig {
  mode: "PKCE";
  /**
   * The external authorization server URL (e.g., "https://openrouter.ai")
   * Used in protected resource metadata to indicate where clients should authenticate
   */
  authorizationServer: string;
  /**
   * Generates the authorization URL where users should be redirected
   * @param callbackUrl - The URL the OAuth provider will redirect back to with the code
   * @returns The full authorization URL to redirect the user to
   */
  authorizationUrl: (callbackUrl: string) => string;
  /**
   * Exchanges the authorization code for access tokens
   * Called when the OAuth callback is received with a code
   */
  exchangeCode: (oauthParams: OAuthParams) => Promise<OAuthTokenResponse>;
  /**
   * Optional: persistence for dynamic client registration (RFC7591)
   * If not provided, clients are accepted without validation
   */
  persistence?: {
    getClient: (clientId: string) => Promise<OAuthClient | null>;
    saveClient: (client: OAuthClient) => Promise<void>;
  };
}

/**
 * Constructs a type by picking all properties from T that are assignable to Value.
 */
type PickByType<T, Value> = {
  [P in keyof T as T[P] extends Value ? P : never]: T[P];
};

export interface CreateMCPServerOptions<
  Env = unknown,
  TSchema extends z.ZodTypeAny = never,
> {
  before?: (env: Env & DefaultEnv<TSchema>) => Promise<void> | void;
  oauth?: OAuthConfig;
  events?: {
    bus?: keyof PickByType<Env & DefaultEnv<TSchema>, EventBusBindingClient>;
    handlers?: EventHandlers<TSchema>;
  };
  configuration?: {
    onChange?: (
      env: Env & DefaultEnv<TSchema>,
      cb: OnChangeCallback<TSchema>,
    ) => Promise<void>;
    state?: TSchema;
    scopes?: string[];
  };
  bindings?: Binding[];
  tools?:
    | Array<
        (
          env: Env & DefaultEnv<TSchema>,
        ) =>
          | Promise<CreatedTool>
          | CreatedTool
          | CreatedTool[]
          | Promise<CreatedTool[]>
      >
    | ((
        env: Env & DefaultEnv<TSchema>,
      ) => CreatedTool[] | Promise<CreatedTool[]>);
}

export type Fetch<TEnv = unknown> = (
  req: Request,
  env: TEnv,
  ctx: any,
) => Promise<Response> | Response;

export interface AppContext<TEnv extends DefaultEnv = DefaultEnv> {
  env: TEnv;
  ctx: { waitUntil: (promise: Promise<unknown>) => void };
  req?: Request;
}

const getEventBus = (
  prop: string | number,
  env: DefaultEnv,
): EventBusBindingClient | undefined => {
  const bus = env as unknown as { [prop]: EventBusBindingClient };
  return typeof bus[prop] !== "undefined" ? bus[prop] : undefined;
};

const toolsFor = <TSchema extends z.ZodTypeAny = never>({
  events,
  configuration: { state: schema, scopes, onChange } = {},
}: CreateMCPServerOptions<any, TSchema> = {}): CreatedTool[] => {
  const jsonSchema = schema
    ? zodToJsonSchema(schema)
    : { type: "object", properties: {} };
  const busProp = String(events?.bus ?? "EVENT_BUS");
  return [
    ...(onChange
      ? [
          createTool({
            id: "ON_MCP_CONFIGURATION",
            description: "MCP Configuration On Change",
            inputSchema: z.object({
              state: schema ?? z.unknown(),
              scopes: z
                .array(z.string())
                .describe(
                  "Array of scopes in format 'KEY::SCOPE' (e.g., 'GMAIL::GetCurrentUser')",
                ),
            }),
            outputSchema: z.object({}),
            execute: async (input) => {
              const state = input.context.state as z.infer<TSchema>;
              await onChange(input.runtimeContext.env, {
                state,
                scopes: input.context.scopes,
              });
              const bus = getEventBus(busProp, input.runtimeContext.env);
              if (events && state && bus) {
                // Sync subscriptions - always call to handle deletions too
                const subscriptions = Event.subscriptions(
                  events?.handlers ?? {},
                  state,
                );
                await bus.EVENT_SYNC_SUBSCRIPTIONS({ subscriptions });
              }
              return Promise.resolve({});
            },
          }),
        ]
      : []),

    ...(events?.handlers
      ? [
          createTool({
            id: "ON_EVENTS",
            description:
              "Receive and process CloudEvents from the event bus. Returns per-event or batch results.",
            inputSchema: OnEventsInputSchema,
            outputSchema: OnEventsOutputSchema,
            execute: async (input) => {
              const env = input.runtimeContext.env;
              // Get state from MESH_REQUEST_CONTEXT - this has the binding values
              const state = env.MESH_REQUEST_CONTEXT?.state as z.infer<TSchema>;
              return Event.execute(
                events.handlers!,
                input.context.events,
                env,
                state,
              );
            },
          }),
        ]
      : []),
    createTool({
      id: "MCP_CONFIGURATION",
      description: "MCP Configuration",
      inputSchema: z.object({}),
      outputSchema: z.object({
        stateSchema: z.unknown(),
        scopes: z.array(z.string()).optional(),
      }),
      execute: () => {
        return Promise.resolve({
          stateSchema: jsonSchema,
          scopes: [
            ...(scopes ?? []),
            ...Event.scopes(events?.handlers ?? {}),
            ...(busProp ? [`${busProp}::EVENT_SYNC_SUBSCRIPTIONS`] : []),
          ],
        });
      },
    }),
  ];
};

type CallTool = (opts: {
  toolCallId: string;
  toolCallInput: unknown;
}) => Promise<unknown>;

export type MCPServer<TEnv = unknown, TSchema extends z.ZodTypeAny = never> = {
  fetch: Fetch<TEnv & DefaultEnv<TSchema>>;
  callTool: CallTool;
};

export const createMCPServer = <
  TEnv = unknown,
  TSchema extends z.ZodTypeAny = never,
>(
  options: CreateMCPServerOptions<TEnv, TSchema>,
): MCPServer<TEnv, TSchema> => {
  const createServer = async (bindings: TEnv & DefaultEnv<TSchema>) => {
    await options.before?.(bindings);

    const server = new McpServer(
      { name: "@deco/mcp-api", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );

    const toolsFn =
      typeof options.tools === "function"
        ? options.tools
        : async (bindings: TEnv & DefaultEnv<TSchema>) => {
            if (typeof options.tools === "function") {
              return await options.tools(bindings);
            }
            return await Promise.all(
              options.tools?.flatMap(async (tool) => {
                const toolResult = tool(bindings);
                const awaited = await toolResult;
                if (Array.isArray(awaited)) {
                  return awaited;
                }
                return [awaited];
              }) ?? [],
            ).then((t) => t.flat());
          };
    const tools = await toolsFn(bindings);

    tools.push(...toolsFor<TSchema>(options));

    for (const tool of tools) {
      server.registerTool(
        tool.id,
        {
          _meta: {
            streamable: isStreamableTool(tool),
          },
          description: tool.description,
          inputSchema:
            tool.inputSchema && "shape" in tool.inputSchema
              ? (tool.inputSchema.shape as z.ZodRawShape)
              : z.object({}).shape,
          outputSchema: isStreamableTool(tool)
            ? z.object({ bytes: z.record(z.string(), z.number()) }).shape
            : tool.outputSchema &&
                typeof tool.outputSchema === "object" &&
                "shape" in tool.outputSchema
              ? (tool.outputSchema.shape as z.ZodRawShape)
              : z.object({}).shape,
        },
        async (args) => {
          let result = await tool.execute({
            context: args,
            runtimeContext: createRuntimeContext(),
          });

          if (isStreamableTool(tool) && result instanceof Response) {
            result = { bytes: await result.bytes() };
          }
          return {
            structuredContent: result as Record<string, unknown>,
            content: [
              {
                type: "text",
                text: JSON.stringify(result),
              },
            ],
          };
        },
      );
    }

    return { server, tools };
  };

  const fetch = async (req: Request, env: TEnv & DefaultEnv<TSchema>) => {
    const { server } = await createServer(env);
    const transport = new HttpServerTransport();

    await server.connect(transport);

    return await transport.handleMessage(req);
  };

  const callTool: CallTool = async ({ toolCallId, toolCallInput }) => {
    const currentState = State.getStore();
    if (!currentState) {
      throw new Error("Missing state, did you forget to call State.bind?");
    }
    const env = currentState?.env;
    const { tools } = await createServer(env as TEnv & DefaultEnv<TSchema>);
    const tool = tools.find((t) => t.id === toolCallId);
    const execute = tool?.execute;
    if (!execute) {
      throw new Error(
        `Tool ${toolCallId} not found or does not have an execute function`,
      );
    }

    return execute({
      context: toolCallInput,
      runtimeContext: createRuntimeContext(),
    });
  };

  return {
    fetch,
    callTool,
  };
};
