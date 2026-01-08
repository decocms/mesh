/**
 * PII Redaction Interface and Implementations
 *
 * Provides pluggable PII redaction for monitoring logs.
 * Default implementation uses regex patterns, but can be swapped
 * with ML-based services like Microsoft Presidio.
 */

import { tracer } from "../observability";

// ============================================================================
// Redactor Interface
// ============================================================================
export interface Redactor {
  /**
   * Redact PII from any data structure (objects, arrays, primitives)
   */
  redact(data: unknown): unknown;

  /**
   * Redact PII from a string
   */
  redactString(text: string): string;
}

// ============================================================================
// Regex-Based Redactor (Default Implementation)
// ============================================================================

interface RedactionPattern {
  type: string;
  regex: RegExp;
}

export class RegexRedactor implements Redactor {
  private patterns: RedactionPattern[] = [
    {
      type: "email",
      regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    },
    {
      type: "api_key",
      regex:
        /(?:api[_-]?key|token|secret|password|bearer)\s*[:=]\s*['"]?[\w-]{16,}['"]?/gi,
    },
    {
      type: "jwt",
      regex: /eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]*/g,
    },
    {
      type: "credit_card",
      regex: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
    },
    {
      type: "ssn",
      regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    },
  ];

  redact(data: unknown): unknown {
    return tracer.startActiveSpan("redactor.redact", (span) => {
      try {
        if (data === null || data === undefined) {
          return data;
        }

        // Handle strings
        if (typeof data === "string") {
          span.setAttribute("data.type", "string");
          return this.redactString(data);
        }

        // Handle arrays
        if (Array.isArray(data)) {
          span.setAttribute("data.type", "array");
          span.setAttribute("data.length", data.length);
          return data.map((item) => this.redact(item));
        }

        // Handle objects
        if (typeof data === "object") {
          span.setAttribute("data.type", "object");
          const redacted: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(data)) {
            // Redact both key and value
            const redactedKey = this.redactString(key);
            redacted[redactedKey] = this.redact(value);
          }
          return redacted;
        }

        // Return primitives as-is (numbers, booleans, etc.)
        span.setAttribute("data.type", typeof data);
        return data;
      } finally {
        span.end();
      }
    });
  }

  redactString(text: string): string {
    return tracer.startActiveSpan("redactor.redactString", (span) => {
      try {
        span.setAttribute("text.length", text.length);
        let redacted = text;
        let redactionCount = 0;

        for (const pattern of this.patterns) {
          const matches = text.match(pattern.regex);
          if (matches) {
            redactionCount += matches.length;
            span.setAttribute(
              `redaction.${pattern.type}.count`,
              matches.length,
            );
          }
          redacted = redacted.replace(
            pattern.regex,
            `[REDACTED:${pattern.type}]`,
          );
        }

        span.setAttribute("redaction.total_count", redactionCount);
        return redacted;
      } finally {
        span.end();
      }
    });
  }
}
