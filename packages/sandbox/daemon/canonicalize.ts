/**
 * Stable, deterministic JSON encoder used to derive a content hash for the
 * bootstrap payload. Recursive sort by key, no whitespace, undefined treated
 * the same as a missing key, env-map sorted by key.
 *
 * Two payloads that differ only in key insertion order or in the presence
 * of explicit `undefined` fields hash to the same value. Pure function.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function canonical(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.map((v) => (v === undefined ? null : canonical(v)));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      out[k] = canonical(obj[k]);
    }
    return out;
  }
  return value;
}
