/**
 * JSON Schema Draft 7 types with Studio-specific extensions
 */
export interface JSONSchema7 {
  $id?: string;
  $ref?: string;
  $schema?: string;
  $comment?: string;

  // Metadata
  title?: string;
  description?: string;
  default?: unknown;
  examples?: unknown[];

  // Type
  type?: JSONSchema7TypeName | JSONSchema7TypeName[];
  enum?: unknown[];
  const?: unknown;

  // Numeric
  multipleOf?: number;
  maximum?: number;
  exclusiveMaximum?: number;
  minimum?: number;
  exclusiveMinimum?: number;

  // String
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  format?: string;

  // Array
  items?: JSONSchema7 | JSONSchema7[];
  additionalItems?: JSONSchema7 | boolean;
  maxItems?: number;
  minItems?: number;
  uniqueItems?: boolean;
  contains?: JSONSchema7;

  // Object
  maxProperties?: number;
  minProperties?: number;
  required?: string[];
  properties?: Record<string, JSONSchema7>;
  patternProperties?: Record<string, JSONSchema7>;
  additionalProperties?: JSONSchema7 | boolean;
  dependencies?: Record<string, JSONSchema7 | string[]>;
  propertyNames?: JSONSchema7;

  // Conditional
  if?: JSONSchema7;
  then?: JSONSchema7;
  else?: JSONSchema7;

  // Boolean
  allOf?: JSONSchema7[];
  anyOf?: JSONSchema7[];
  oneOf?: JSONSchema7[];
  not?: JSONSchema7;

  // Definitions
  definitions?: Record<string, JSONSchema7>;

  // Studio extensions
  "ui:widget"?: string;
  "ui:options"?: Record<string, unknown>;
  "ui:order"?: string[];
}

export type JSONSchema7TypeName =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "object"
  | "array"
  | "null";

export interface SavedSchema {
  id: string;
  name: string;
  schema: JSONSchema7;
  createdAt: string;
  updatedAt: string;
}

