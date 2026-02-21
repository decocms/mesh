import {
  connectionImplementsBinding,
  type ConnectionForBinding,
} from "@decocms/bindings";
import { DECO_BLOCKS_BINDING } from "@decocms/bindings";

/**
 * Checks if a connection implements the DECO_BLOCKS_BINDING.
 *
 * A connection is considered a Deco site if it provides both
 * BLOCKS_LIST and LOADERS_LIST tools (the full DECO_BLOCKS_BINDING).
 *
 * @param connection - Any connection object with a tools array
 * @returns true if the connection implements DECO_BLOCKS_BINDING
 */
export function isDecoSite(connection: ConnectionForBinding): boolean {
  return connectionImplementsBinding(connection, DECO_BLOCKS_BINDING);
}
