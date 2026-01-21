/**
 * Universal Webhook Adapter Types
 *
 * Defines the interface for the Slack webhook adapter.
 */

/**
 * Configuration passed to webhook adapter
 */
export interface WebhookConfig {
  /** Connection ID */
  connectionId: string;
  /** Organization ID */
  organizationId: string;
  /** Signing secret for signature verification */
  signingSecret?: string;
  /** Any additional configuration from MCP state */
  [key: string]: unknown;
}

/**
 * Result of webhook verification
 */
export interface VerificationResult {
  verified: boolean;
  error?: string;
}

/**
 * Webhook Adapter Interface
 */
export interface WebhookAdapter {
  /** Unique identifier for this adapter */
  readonly type: string;

  /** Human-readable name */
  readonly name: string;

  /**
   * Check if this adapter can handle the given request
   */
  matches(req: Request, body: unknown): boolean;

  /**
   * Verify the request signature
   */
  verify(
    req: Request,
    rawBody: string,
    config: WebhookConfig,
  ): Promise<VerificationResult>;

  /**
   * Handle challenge/verification requests
   * Returns a Response if this is a challenge, null otherwise
   */
  handleChallenge(
    req: Request,
    body: unknown,
    config: WebhookConfig,
  ): Response | null;

  /**
   * Extract the event type from the payload
   */
  getEventType(body: unknown): string;

  /**
   * Extract subject/identifier from the payload (optional)
   */
  getSubject?(body: unknown): string | undefined;
}

/**
 * Supported webhook adapter types
 */
export type WebhookAdapterType = "slack";
