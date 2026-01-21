/**
 * Webhook Adapter Types
 */

export interface WebhookConfig {
  connectionId: string;
  organizationId: string;
  [key: string]: unknown;
}

export interface VerificationResult {
  verified: boolean;
  error?: string;
}

export interface WebhookAdapter {
  readonly type: string;
  readonly name: string;

  verify(
    req: Request,
    rawBody: string,
    config: WebhookConfig,
  ): Promise<VerificationResult>;

  handleChallenge(
    req: Request,
    body: unknown,
    config: WebhookConfig,
  ): Response | null;

  getEventType(body: unknown): string;

  getSubject?(body: unknown): string | undefined;
}

export type WebhookAdapterType = "slack";
