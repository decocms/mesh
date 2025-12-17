import type { MCPConnection } from "./connection.ts";
import type { DefaultEnv, RequestContext } from "./index.ts";
import { MCPClient } from "./mcp.ts";
import type {
  BindingBase,
  ContractBinding,
  MCPAppBinding,
  MCPBinding,
} from "./wrangler.ts";

type ClientContext = Omit<
  RequestContext,
  "ensureAuthenticated" | "state" | "fetchIntegrationMetadata"
>;

export const proxyConnectionForId = (
  connectionId: string,
  ctx: Omit<ClientContext, "token"> & {
    token?: string;
    cookie?: string;
    meshUrl: string;
  },
  appName?: string,
): MCPConnection => {
  let headers: Record<string, string> | undefined = appName
    ? { "x-caller-app": appName }
    : undefined;
  if (ctx.cookie) {
    headers ??= {};
    headers.cookie = ctx.cookie;
  }
  return {
    type: "HTTP",
    url: new URL(`/mcp/${connectionId}`, ctx.meshUrl).href,
    token: ctx.token,
    headers,
  };
};
export const mcpClientForConnectionId = (
  connectionId: string,
  ctx: ClientContext,
  appName?: string,
) => {
  const mcpConnection = proxyConnectionForId(connectionId, ctx, appName);

  // TODO(@igorbrasileiro): Switch this proxy to be a proxy that call MCP Client.toolCall from @modelcontextprotocol
  return MCPClient.forConnection(mcpConnection);
};

function mcpClientFromState(
  binding: BindingBase | MCPAppBinding,
  env: DefaultEnv,
) {
  const ctx = env.MESH_REQUEST_CONTEXT;
  const bindingFromState = ctx?.state?.[binding.name];
  const connectionId =
    bindingFromState &&
    typeof bindingFromState === "object" &&
    "value" in bindingFromState
      ? bindingFromState.value
      : undefined;
  if (typeof connectionId !== "string" && "app_name" in binding) {
    // in case of a binding to an app name, we need to use the new apps/mcp endpoint which will proxy the request to the app but without any token
    return undefined;
  }
  return mcpClientForConnectionId(connectionId, ctx);
}

export const createContractBinding = (
  binding: ContractBinding,
  env: DefaultEnv,
) => {
  return mcpClientFromState(binding, env);
};

export const createIntegrationBinding = (
  binding: MCPBinding,
  env: DefaultEnv,
) => {
  const connectionId =
    "connection_id" in binding ? binding.connection_id : undefined;
  if (!connectionId) {
    return mcpClientFromState(binding, env);
  }
  if (!env.MESH_RUNTIME_TOKEN) {
    throw new Error("MESH_RUNTIME_TOKEN is required");
  }
  if (!env.MESH_URL) {
    throw new Error("MESH_URL is required");
  }
  // bindings pointed to an specific integration id are binded using the app deployment workspace
  return mcpClientForConnectionId(
    connectionId,
    {
      token: env.MESH_RUNTIME_TOKEN,
      meshUrl: env.MESH_URL,
    },
    env.MESH_APP_NAME,
  );
};
