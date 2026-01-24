/**
 * Gateway Templates Plugin - Security Index
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
  type GatewayTemplateConnectionMetadata,
} from "./validate-session-access";
