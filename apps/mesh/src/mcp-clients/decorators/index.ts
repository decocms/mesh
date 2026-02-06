/**
 * MCP Client Decorators
 *
 * Provides decorator functions that enhance MCP clients with additional functionality:
 * - withToolCaching: Adds tool list caching using indexed database tools
 * - withStreamingSupport: Adds streaming support for HTTP connections
 */

export { withToolCaching } from "./with-tool-caching";
export {
  withStreamingSupport,
  type ClientWithOptionalStreamingSupport,
  type ClientWithStreamingSupport,
} from "./with-streaming-support";
