/**
 * Connection Collection Hooks
 *
 * Re-exports from @decocms/mesh-sdk for backwards compatibility.
 * New code should import from @decocms/mesh-sdk directly.
 */

export {
  useConnections,
  useConnection,
  useConnectionActions,
  type ConnectionFilter,
  type UseConnectionsOptions,
} from "@decocms/mesh-sdk";

// Re-export ConnectionEntity from the local schema for backwards compatibility
export type { ConnectionEntity } from "../../../tools/connection/schema";
