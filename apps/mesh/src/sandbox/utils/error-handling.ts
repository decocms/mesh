/**
 * Inspects and serializes any value to a meaningful string representation.
 * Similar to Node.js's util.inspect, but optimized for error handling and debugging.
 */
export function inspect(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  if (value instanceof Error) {
    const message = value.message || value.name || "Error";
    if (value.stack && value.stack.length < 2000) {
      return `${message}\n${value.stack}`;
    }
    return message;
  }

  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;

    let message = "";
    if (typeof obj.message === "string" && obj.message) message = obj.message;
    else if (typeof obj.error === "string" && obj.error) message = obj.error;
    else if (typeof obj.description === "string" && obj.description)
      message = obj.description;
    else if (typeof obj.reason === "string" && obj.reason) message = obj.reason;

    if (message) {
      if (
        typeof obj.stack === "string" &&
        obj.stack &&
        obj.stack.length < 2000
      ) {
        return `${message}\n${obj.stack}`;
      }
      return message;
    }

    try {
      const stringified = JSON.stringify(obj, null, 2);
      if (stringified !== "{}" && stringified.length < 1000) {
        if (
          typeof obj.stack === "string" &&
          obj.stack &&
          obj.stack.length < 2000
        ) {
          return `${stringified}\n\nStack trace:\n${obj.stack}`;
        }
        return stringified;
      }
    } catch {
      // ignore
    }

    if (typeof obj.toString === "function") {
      try {
        const stringified = obj.toString();
        if (stringified !== "[object Object]") return stringified;
      } catch {
        // ignore
      }
    }

    const keys = Object.keys(obj);
    if (keys.length > 0) return `Object with keys: ${keys.join(", ")}`;
    return "[object Object]";
  }

  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (typeof value === "function") return `[Function: ${value.name || "anon"}]`;
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "bigint") return value.toString();

  try {
    return String(value);
  } catch {
    return "Unknown value (could not convert to string)";
  }
}
