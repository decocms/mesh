/**
 * User Sandbox Plugin - Security Index
 */

export {
  validateSession,
  validateSessionForConfiguration,
  validateConnectionBelongsToSession,
  validateSessionAccess,
  createConnectionMetadata,
  createAgentMetadata,
  SessionAccessError,
  METADATA_KEYS,
  type UserSandboxConnectionMetadata,
} from "./validate-session-access";
