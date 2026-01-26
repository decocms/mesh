/**
 * PII Redaction Interface and Implementations
 *
 * Provides pluggable PII redaction for monitoring logs.
 * Default implementation uses regex patterns, but can be swapped
 * with ML-based services like Microsoft Presidio.
 */

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
    if (data === null || data === undefined) {
      return data;
    }

    // Handle strings
    if (typeof data === "string") {
      return this.redactString(data);
    }

    // Handle arrays
    if (Array.isArray(data)) {
      return data.map((item) => this.redact(item));
    }

    // Handle objects
    if (typeof data === "object") {
      const redacted: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        // Redact both key and value
        const redactedKey = this.redactString(key);
        redacted[redactedKey] = this.redact(value);
      }
      return redacted;
    }
    // Return primitives as-is (numbers, booleans, etc.)
    return data;
  }

  redactString(text: string): string {
    let redacted = text;

    for (const pattern of this.patterns) {
      redacted = redacted.replace(pattern.regex, `[REDACTED:${pattern.type}]`);
    }

    return redacted;
  }
}
