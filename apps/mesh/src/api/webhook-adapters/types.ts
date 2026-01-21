/**
 * Universal Webhook Adapter Types
 *
 * Defines the interface for webhook adapters.
 * Each adapter is responsible for extracting the config fields it needs.
 */

/**
 * Configuration passed to webhook adapter
 * Contains all fields from the connection's configuration_state
 * Each adapter extracts what it needs
 */
export interface WebhookConfig {
  /** Connection ID */
  connectionId: string;
  /** Organization ID */
  organizationId: string;
  /** All configuration from MCP state - adapter extracts what it needs */
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
 *
 * Each adapter is responsible for:
 * - Detecting if it can handle a request
 * - Extracting its config fields from WebhookConfig
 * - Verifying signatures
 * - Handling challenges
 * - Extracting event type and subject
 */
export interface WebhookAdapter {
  /** Unique identifier for this adapter */
  readonly type: string;

  /** Human-readable name */
  readonly name: string;

  /**
   * Config field names this adapter looks for
   * Used for documentation and debugging only
   */
  readonly configFields: readonly string[];

  /**
   * Check if this adapter can handle the given request
   */
  matches(req: Request, body: unknown): boolean;

  /**
   * Verify the request signature
   * Adapter extracts the signing secret from config using its own field names
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
