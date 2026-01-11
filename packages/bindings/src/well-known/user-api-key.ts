/**
 * User API Key Well-Known Binding
 *
 * Allows an MCP to request an API key that represents the configuring user.
 * When a user configures this binding, an API key is automatically created
 * with that user's identity and permissions.
 *
 * The MCP can then use this API key to make calls on behalf of the user,
 * inheriting their permissions for gateways, connections, and tools.
 *
 * Use Case:
 * - Pilot (or any agent) needs to call tools through a gateway
 * - The gateway requires user-level permissions
 * - Each user configures their own Pilot with their own API key
 * - Pilot uses the API key to call the gateway with user's permissions
 *
 * @example
 * ```typescript
 * // In MCP configuration schema:
 * {
 *   USER_API_KEY: {
 *     type: "user-api-key",
 *     description: "API key for calling Mesh on behalf of this user"
 *   }
 * }
 *
 * // After configuration, the MCP receives via ON_MCP_CONFIGURATION:
 * {
 *   USER_API_KEY: {
 *     value: "mesh_xxx...",  // The actual API key
 *     userId: "user_123",    // The user who configured this
 *     keyId: "key_456"       // The API key ID (for management)
 *   }
 * }
 * ```
 */

import { bindingClient, type ToolBinder } from "../core/binder";

/**
 * User API Key Binding
 *
 * This binding type doesn't require specific tools - it's a special binding
 * that triggers API key generation in the Mesh UI.
 *
 * When configured:
 * 1. Mesh UI detects this binding type
 * 2. Automatically creates an API key for the current user
 * 3. API key has permissions based on the user's role/access
 * 4. Key is stored in configuration state and sent via ON_MCP_CONFIGURATION
 */
export const USER_API_KEY_BINDING: ToolBinder[] = [];

/**
 * User API Key Binding Client
 *
 * Use this to create a client for working with the user API key.
 *
 * @example
 * ```typescript
 * import { UserApiKeyBinding } from "@decocms/bindings/user-api-key";
 *
 * // In MCP, after receiving ON_MCP_CONFIGURATION:
 * const apiKey = state.USER_API_KEY?.value;
 * // Use apiKey in Authorization header when calling Mesh
 * ```
 */
export const UserApiKeyBinding = bindingClient(USER_API_KEY_BINDING);

/**
 * Type helper for the User API Key binding client
 */
export type UserApiKeyBindingClient = ReturnType<
  typeof UserApiKeyBinding.forConnection
>;

/**
 * Shape of the User API Key state value
 */
export interface UserApiKeyState {
  /** The actual API key value (Bearer token) */
  value: string;
  /** The user ID who owns this API key */
  userId: string;
  /** The API key ID (for management/revocation) */
  keyId: string;
}
