/**
 * Block Scanner Types
 *
 * Core type definitions used throughout the scanner pipeline:
 * discover components -> extract props -> generate JSON Schema -> write block definitions.
 */

/**
 * JSON Schema 7 type (simplified for block definitions).
 * Using a local definition to avoid heavy external type dependencies.
 */
export interface JSONSchema7 {
  $schema?: string;
  $id?: string;
  $ref?: string;
  $defs?: Record<string, JSONSchema7>;
  definitions?: Record<string, JSONSchema7>;
  type?: string | string[];
  title?: string;
  description?: string;
  default?: unknown;
  examples?: unknown[];
  enum?: unknown[];
  const?: unknown;
  properties?: Record<string, JSONSchema7>;
  required?: string[];
  additionalProperties?: boolean | JSONSchema7;
  items?: JSONSchema7 | JSONSchema7[];
  allOf?: JSONSchema7[];
  anyOf?: JSONSchema7[];
  oneOf?: JSONSchema7[];
  not?: JSONSchema7;
  if?: JSONSchema7;
  then?: JSONSchema7;
  else?: JSONSchema7;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  [key: string]: unknown;
}

/**
 * Full block definition stored in .deco/blocks/{id}.json.
 * This is the canonical format for all block data -- scanned, manual, or AI-generated.
 */
export interface BlockDefinition {
  /** Unique ID derived from component path, e.g., "sections--Hero" */
  id: string;
  /** Source component path, e.g., "sections/Hero.tsx" */
  component: string;
  /** Human-readable label, e.g., "Hero Banner" */
  label: string;
  /** Category derived from directory, e.g., "Sections" */
  category: string;
  /** Description from JSDoc or manually provided */
  description: string;
  /** JSON Schema for the component's props */
  schema: JSONSchema7;
  /** Default prop values (empty initially) */
  defaults: Record<string, unknown>;
  /** Scan metadata */
  metadata: {
    /** ISO timestamp of last scan */
    scannedAt: string;
    /** How this block was discovered */
    scanMethod: "ts-morph" | "manual" | "ai-agent";
    /** Original TypeScript type name for the props */
    propsTypeName: string | null;
    /** Fields manually edited by user (preserved during re-scan) */
    customized: string[];
  };
}

/**
 * Intermediate component info extracted during discovery phase.
 */
export interface ComponentInfo {
  /** Component name (function name or file basename) */
  name: string;
  /** Source file path within the project */
  filePath: string;
  /** TypeScript type name for the props parameter, or null */
  propsTypeName: string | null;
  /** JSDoc description from the component */
  jsDocDescription: string;
}

/**
 * Result of a scan operation.
 */
export interface ScanResult {
  /** Summary of all discovered blocks */
  blocks: BlockSummary[];
  /** Errors encountered during scanning (non-fatal) */
  errors: string[];
}

/**
 * Lightweight block summary for list operations.
 */
export interface BlockSummary {
  /** Block ID, e.g., "sections--Hero" */
  id: string;
  /** Source component path */
  component: string;
  /** Human-readable label */
  label: string;
  /** Category name */
  category: string;
  /** Number of top-level props */
  propsCount: number;
}
