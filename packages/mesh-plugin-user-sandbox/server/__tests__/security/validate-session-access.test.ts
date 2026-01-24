/**
 * Session Access Validation Tests
 */

import { describe, it, expect } from "bun:test";
import {
  validateSession,
  validateSessionForConfiguration,
  validateConnectionBelongsToSession,
  SessionAccessError,
  METADATA_KEYS,
} from "../../security/validate-session-access";
import type { UserSandboxPluginStorage } from "../../storage";
import type { UserSandboxSessionEntity } from "../../storage/types";

// Mock storage
function createMockStorage(
  session: UserSandboxSessionEntity | null,
): UserSandboxPluginStorage {
  return {
    templates: {} as never,
    sessions: {
      findById: async () => session,
      findExisting: async () => null,
      listByTemplate: async () => [],
      listByOrganization: async () => [],
      create: async () => session!,
      update: async () => session!,
      delete: async () => {},
      deleteExpired: async () => 0,
    },
  };
}

// Create test session
function createTestSession(
  overrides?: Partial<UserSandboxSessionEntity>,
): UserSandboxSessionEntity {
  return {
    id: "uss_test",
    template_id: "usb_test",
    organization_id: "org_test",
    external_user_id: "user_123",
    status: "pending",
    app_statuses: {},
    created_agent_id: null,
    redirect_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
    ...overrides,
  };
}

describe("validateSession", () => {
  it("allows access to valid session", async () => {
    const session = createTestSession();
    const storage = createMockStorage(session);

    const result = await validateSession("uss_test", storage);
    expect(result.id).toBe("uss_test");
  });

  it("rejects access to non-existent session", async () => {
    const storage = createMockStorage(null);

    await expect(validateSession("uss_nonexistent", storage)).rejects.toThrow(
      SessionAccessError,
    );

    try {
      await validateSession("uss_nonexistent", storage);
    } catch (err) {
      expect(err).toBeInstanceOf(SessionAccessError);
      expect((err as SessionAccessError).code).toBe("SESSION_NOT_FOUND");
    }
  });

  it("rejects access to expired session", async () => {
    const session = createTestSession({
      expires_at: new Date(Date.now() - 1000).toISOString(), // Expired
    });
    const storage = createMockStorage(session);

    await expect(validateSession("uss_test", storage)).rejects.toThrow(
      SessionAccessError,
    );

    try {
      await validateSession("uss_test", storage);
    } catch (err) {
      expect((err as SessionAccessError).code).toBe("SESSION_EXPIRED");
    }
  });
});

describe("validateSessionForConfiguration", () => {
  it("allows configuration of pending session", async () => {
    const session = createTestSession({ status: "pending" });
    const storage = createMockStorage(session);

    const result = await validateSessionForConfiguration("uss_test", storage);
    expect(result.status).toBe("pending");
  });

  it("allows configuration of in_progress session", async () => {
    const session = createTestSession({ status: "in_progress" });
    const storage = createMockStorage(session);

    const result = await validateSessionForConfiguration("uss_test", storage);
    expect(result.status).toBe("in_progress");
  });

  it("rejects configuration of completed session", async () => {
    const session = createTestSession({ status: "completed" });
    const storage = createMockStorage(session);

    await expect(
      validateSessionForConfiguration("uss_test", storage),
    ).rejects.toThrow(SessionAccessError);

    try {
      await validateSessionForConfiguration("uss_test", storage);
    } catch (err) {
      expect((err as SessionAccessError).code).toBe("SESSION_COMPLETED");
    }
  });
});

describe("validateConnectionBelongsToSession", () => {
  it("allows access to connection with matching session ID", () => {
    const session = createTestSession();
    const connection = {
      metadata: {
        [METADATA_KEYS.SESSION_ID]: "uss_test",
      },
    };

    // Should not throw
    validateConnectionBelongsToSession(connection, session);
  });

  it("allows access to connection with matching external user ID and template ID", () => {
    const session = createTestSession({
      external_user_id: "user_123",
      template_id: "usb_test",
    });
    const connection = {
      metadata: {
        [METADATA_KEYS.EXTERNAL_USER_ID]: "user_123",
        [METADATA_KEYS.TEMPLATE_ID]: "usb_test",
      },
    };

    // Should not throw
    validateConnectionBelongsToSession(connection, session);
  });

  it("rejects connection with no metadata", () => {
    const session = createTestSession();
    const connection = { metadata: null };

    expect(() =>
      validateConnectionBelongsToSession(connection, session),
    ).toThrow(SessionAccessError);
  });

  it("rejects connection from different session", () => {
    const session = createTestSession();
    const connection = {
      metadata: {
        [METADATA_KEYS.SESSION_ID]: "uss_other",
        [METADATA_KEYS.EXTERNAL_USER_ID]: "other_user",
        [METADATA_KEYS.TEMPLATE_ID]: "usb_other",
      },
    };

    expect(() =>
      validateConnectionBelongsToSession(connection, session),
    ).toThrow(SessionAccessError);
  });

  it("rejects connection with different external_user_id", () => {
    const session = createTestSession({ external_user_id: "user_123" });
    const connection = {
      metadata: {
        [METADATA_KEYS.EXTERNAL_USER_ID]: "different_user",
        [METADATA_KEYS.TEMPLATE_ID]: session.template_id,
      },
    };

    expect(() =>
      validateConnectionBelongsToSession(connection, session),
    ).toThrow(SessionAccessError);

    try {
      validateConnectionBelongsToSession(connection, session);
    } catch (err) {
      expect((err as SessionAccessError).code).toBe("CONNECTION_ACCESS_DENIED");
    }
  });
});
