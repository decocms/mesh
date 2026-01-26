/**
 * Outbound MCP Clients
 *
 * Client creation and management for outbound MCP connections (HTTP, SSE, STDIO)
 */

export {
  createOutboundClient,
  type DisposableClient,
  type CreateOutboundClientOptions,
} from "./client-factory";

export {
  buildRequestHeaders,
  createLoggingTransport,
  createTransportForConnection,
} from "./network-transport";
