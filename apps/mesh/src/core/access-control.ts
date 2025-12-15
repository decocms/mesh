/**
 * Access Control for MCP Mesh
 *
 * Uses Better Auth's permission system for authorization.
 * Follows a grant-based model:
 * 1. Tools call ctx.access.check() to verify permissions
 * 2. If allowed, access is granted internally
 * 3. Middleware verifies that access was granted
 * 4. Tools can manually grant access for custom logic
 */

import type { BetterAuthInstance, BoundAuthClient } from "./mesh-context";
import { WellKnownMCPId } from "./well-known-mcp";

// Forward declaration (will be replaced with actual Better Auth type)

// ============================================================================
// Errors
// ============================================================================

/**
 * Custom error for unauthenticated requests (401)
 */
export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Custom error for access denial (403)
 */
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

// ============================================================================
// AccessControl Class
// ============================================================================

/**
 * AccessControl using Better Auth's permission system
 *
 * Delegates all permission checks to Better Auth's Organization plugin
 * via the BoundAuthClient (which encapsulates HTTP headers)
 */
export class AccessControl implements Disposable {
  private _granted: boolean = false;

  constructor(
    _auth: BetterAuthInstance, // Kept for backwards compatibility, not used
    private userId?: string,
    private toolName?: string,
    private boundAuth?: BoundAuthClient, // Bound auth client for permission checks
    private role?: string, // From user session (for built-in role bypass)
    private connectionId: string = WellKnownMCPId.SELF, // For connection-specific checks
  ) {}

  [Symbol.dispose](): void {
    this._granted = false;
  }

  setToolName(toolName: string): void {
    this.toolName = toolName;
  }

  /**
   * Grant access unconditionally
   * Use for manual overrides, admin actions, or custom validation
   */
  grant(): Disposable {
    this._granted = true;
    return {
      [Symbol.dispose]: () => {
        this._granted = false;
      },
    };
  }

  /**
   * Check permissions and grant access if allowed
   *
   * @param resources - Resources to check (OR logic)
   * If omitted, checks the current tool name
   *
   * @throws UnauthorizedError if not authenticated (401)
   * @throws ForbiddenError if access is denied (403)
   *
   * @example
   * await ctx.access.check(); // Check current tool
   * await ctx.access.check('conn_<UUID>'); // Check connection access
   * await ctx.access.check('TOOL1', 'TOOL2'); // Check TOOL1 OR TOOL2
   */
  async check(...resources: string[]): Promise<void> {
    // If already granted, skip check
    if (this._granted) {
      return;
    }

    // Check if authenticated first (401)
    if (!this.userId && !this.boundAuth) {
      throw new UnauthorizedError(
        "Authentication required. Please provide a valid OAuth token or API key.",
      );
    }

    // Determine what to check
    const resourcesToCheck =
      resources.length > 0 ? resources : this.toolName ? [this.toolName] : [];

    if (resourcesToCheck.length === 0) {
      throw new ForbiddenError("No resources specified for access check");
    }

    // Try each resource - if ANY succeeds, grant access (OR logic)
    for (const resource of resourcesToCheck) {
      const hasAccess = await this.checkResource(resource);
      if (hasAccess) {
        this.grant();
        return;
      }
    }

    // No permission found
    throw new ForbiddenError(
      `Access denied to: ${resourcesToCheck.join(", ")}`,
    );
  }

  /**
   * Check if user has permission to access a resource
   * Delegates to Better Auth's Organization plugin via boundAuth
   */
  private async checkResource(resource: string): Promise<boolean> {
    // No user or bound auth = deny
    if (!this.userId && !this.boundAuth) {
      return false;
    }

    // Admin and owner roles bypass all checks (they have full access)
    if (this.role === "admin" || this.role === "owner") {
      return true;
    }

    // No bound auth client = deny (should not happen in normal flow)
    if (!this.boundAuth) {
      return false;
    }

    // Build permission check - use connectionId as the resource key
    const permissionToCheck: Record<string, string[]> = {};
    if (this.connectionId) {
      permissionToCheck[this.connectionId] = [resource];
    }

    // Delegate to Better Auth's hasPermission API
    return this.boundAuth.hasPermission(permissionToCheck);
  }

  /**
   * Check if access was granted
   */
  granted(): boolean {
    return this._granted;
  }
}
