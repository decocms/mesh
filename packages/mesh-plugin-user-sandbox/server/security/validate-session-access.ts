/**
 * User Sandbox Plugin - Session Access Validation
 *
 * Security utilities for validating access to sessions and connections
 * during the brandless connect flow.
 *
 * Key principle: The session URL is the only credential for end-users,
 * so every operation must validate that it only accesses resources
 * belonging to that session/external user.
 */

import type { UserSandboxPluginStorage } from "../storage";
import type { UserSandboxSessionEntity } from "../storage/types";

// Metadata keys used to tag connections created by user sandbox
export const METADATA_KEYS = {
  SESSION_ID: "user_sandbox_session_id",
  EXTERNAL_USER_ID: "user_sandbox_external_user_id",
  TEMPLATE_ID: "user_sandbox_id",
} as const;

/**
 * Error thrown when session access validation fails
 */
export class SessionAccessError extends Error {
  constructor(
    message: string,
    public code:
      | "SESSION_NOT_FOUND"
      | "SESSION_EXPIRED"
      | "SESSION_COMPLETED"
      | "ACCESS_DENIED"
      | "CONNECTION_ACCESS_DENIED",
  ) {
    super(message);
    this.name = "SessionAccessError";
  }
}

/**
 * Connection metadata structure for user sandbox connections
 */
export interface UserSandboxConnectionMetadata {
  [METADATA_KEYS.SESSION_ID]?: string;
  [METADATA_KEYS.EXTERNAL_USER_ID]?: string;
  [METADATA_KEYS.TEMPLATE_ID]?: string;
}

/**
 * Validate that a session exists and is not expired.
 * Returns the session entity if valid.
 *
 * @throws SessionAccessError if session is invalid
 */
export async function validateSession(
  sessionId: string,
  storage: UserSandboxPluginStorage,
): Promise<UserSandboxSessionEntity> {
  const session = await storage.sessions.findById(sessionId);

  if (!session) {
    throw new SessionAccessError("Session not found", "SESSION_NOT_FOUND");
  }

  // Check if expired
  if (new Date(session.expires_at) < new Date()) {
    throw new SessionAccessError("Session has expired", "SESSION_EXPIRED");
  }

  return session;
}

/**
 * Validate that a session can be used for configuration.
 * Completed sessions can only be accessed by the same external user for reconfiguration.
 *
 * @throws SessionAccessError if session cannot be used
 */
export async function validateSessionForConfiguration(
  sessionId: string,
  storage: UserSandboxPluginStorage,
): Promise<UserSandboxSessionEntity> {
  const session = await validateSession(sessionId, storage);

  // Completed sessions are read-only through the connect flow
  // Users can create a new session to reconfigure
  if (session.status === "completed") {
    throw new SessionAccessError(
      "Session is already completed. Create a new session to reconfigure.",
      "SESSION_COMPLETED",
    );
  }

  return session;
}

/**
 * Validate that a connection belongs to a session.
 *
 * A connection belongs to a session if:
 * 1. Its metadata contains the session ID, OR
 * 2. Its metadata contains the same external_user_id AND template_id as the session
 *    (for reconfiguration of existing connections)
 *
 * @throws SessionAccessError if connection doesn't belong to session
 */
export function validateConnectionBelongsToSession(
  connection: { metadata: Record<string, unknown> | null },
  session: UserSandboxSessionEntity,
): void {
  const metadata = connection.metadata as UserSandboxConnectionMetadata | null;

  if (!metadata) {
    throw new SessionAccessError(
      "Connection has no metadata",
      "CONNECTION_ACCESS_DENIED",
    );
  }

  // Check direct session ownership
  const belongsToSession = metadata[METADATA_KEYS.SESSION_ID] === session.id;

  // Check ownership by external user + template (for reconfiguration)
  const belongsToUser =
    metadata[METADATA_KEYS.EXTERNAL_USER_ID] === session.external_user_id &&
    metadata[METADATA_KEYS.TEMPLATE_ID] === session.template_id;

  if (!belongsToSession && !belongsToUser) {
    throw new SessionAccessError(
      "Access denied: connection does not belong to this session",
      "CONNECTION_ACCESS_DENIED",
    );
  }
}

/**
 * Create connection metadata for a connection created via user sandbox.
 */
export function createConnectionMetadata(
  sessionId: string,
  externalUserId: string,
  templateId: string,
): UserSandboxConnectionMetadata & { source: string } {
  return {
    [METADATA_KEYS.SESSION_ID]: sessionId,
    [METADATA_KEYS.EXTERNAL_USER_ID]: externalUserId,
    [METADATA_KEYS.TEMPLATE_ID]: templateId,
    source: "user-sandbox",
  };
}

/**
 * Create agent (Virtual MCP) metadata for an agent created via user sandbox.
 * Note: Agents don't include SESSION_ID since they are long-lived and can span multiple sessions.
 */
export function createAgentMetadata(
  externalUserId: string,
  templateId: string,
): UserSandboxConnectionMetadata & { source: string } {
  return {
    [METADATA_KEYS.EXTERNAL_USER_ID]: externalUserId,
    [METADATA_KEYS.TEMPLATE_ID]: templateId,
    source: "user-sandbox",
  };
}

/**
 * Full session access validation for API routes.
 * Validates session and optionally a connection.
 */
export async function validateSessionAccess(
  sessionId: string,
  storage: UserSandboxPluginStorage,
  options?: {
    /** Connection to validate belongs to session */
    connection?: { metadata: Record<string, unknown> | null };
    /** Allow completed sessions (for read-only access) */
    allowCompleted?: boolean;
  },
): Promise<UserSandboxSessionEntity> {
  // Validate session
  const session = options?.allowCompleted
    ? await validateSession(sessionId, storage)
    : await validateSessionForConfiguration(sessionId, storage);

  // Validate connection if provided
  if (options?.connection) {
    validateConnectionBelongsToSession(options.connection, session);
  }

  return session;
}
