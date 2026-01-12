/**
 * Object Storage Well-Known Binding
 *
 * Defines the interface for S3-compatible object storage operations.
 * Any MCP that implements this binding can provide file/object management
 * for buckets and objects.
 *
 * This binding includes:
 * - LIST_OBJECTS: List objects with pagination and prefix filtering
 * - GET_OBJECT_METADATA: Get object metadata (HEAD operation)
 * - GET_PRESIGNED_URL: Generate presigned URL for downloading
 * - PUT_PRESIGNED_URL: Generate presigned URL for uploading
 * - DELETE_OBJECT: Delete a single object
 * - DELETE_OBJECTS: Batch delete multiple objects
 */

import { z } from "zod";
import type { Binder, ToolBinder } from "../core/binder";

// ============================================================================
// Tool Schemas
// ============================================================================

/**
 * LIST_OBJECTS - List objects in the bucket with pagination support
 */
const ListObjectsInputSchema = z.object({
  prefix: z
    .string()
    .optional()
    .describe("Filter objects by prefix (e.g., 'folder/' for folder contents)"),
  maxKeys: z
    .number()
    .optional()
    .default(1000)
    .describe("Maximum number of keys to return (default: 1000)"),
  continuationToken: z
    .string()
    .optional()
    .describe("Token for pagination from previous response"),
});

const ListObjectsOutputSchema = z.object({
  objects: z.array(
    z.object({
      key: z.string().describe("Object key/path"),
      size: z.number().describe("Object size in bytes"),
      lastModified: z.string().describe("Last modified timestamp"),
      etag: z.string().describe("Entity tag for the object"),
    }),
  ),
  nextContinuationToken: z
    .string()
    .optional()
    .describe("Token for fetching next page of results"),
  isTruncated: z.boolean().describe("Whether there are more results available"),
});

export type ListObjectsInput = z.infer<typeof ListObjectsInputSchema>;
export type ListObjectsOutput = z.infer<typeof ListObjectsOutputSchema>;

/**
 * GET_OBJECT_METADATA - Get object metadata using HEAD operation
 */
const GetObjectMetadataInputSchema = z.object({
  key: z.string().describe("Object key/path to get metadata for"),
});

const GetObjectMetadataOutputSchema = z.object({
  contentType: z.string().optional().describe("MIME type of the object"),
  contentLength: z.number().describe("Size of the object in bytes"),
  lastModified: z.string().describe("Last modified timestamp"),
  etag: z.string().describe("Entity tag for the object"),
  metadata: z
    .record(z.string(), z.string())
    .optional()
    .describe("Custom metadata key-value pairs"),
});

export type GetObjectMetadataInput = z.infer<
  typeof GetObjectMetadataInputSchema
>;
export type GetObjectMetadataOutput = z.infer<
  typeof GetObjectMetadataOutputSchema
>;

/**
 * GET_PRESIGNED_URL - Generate a presigned URL for downloading an object
 */
const GetPresignedUrlInputSchema = z.object({
  key: z.string().describe("Object key/path to generate URL for"),
  expiresIn: z
    .number()
    .optional()
    .describe(
      "URL expiration time in seconds (default: from state config or 3600)",
    ),
});

const GetPresignedUrlOutputSchema = z.object({
  url: z.string().describe("Presigned URL for downloading the object"),
  expiresIn: z.number().describe("Expiration time in seconds that was used"),
});

export type GetPresignedUrlInput = z.infer<typeof GetPresignedUrlInputSchema>;
export type GetPresignedUrlOutput = z.infer<typeof GetPresignedUrlOutputSchema>;

/**
 * PUT_PRESIGNED_URL - Generate a presigned URL for uploading an object
 */
const PutPresignedUrlInputSchema = z.object({
  key: z.string().describe("Object key/path for the upload"),
  expiresIn: z
    .number()
    .optional()
    .describe(
      "URL expiration time in seconds (default: from state config or 3600)",
    ),
  contentType: z
    .string()
    .optional()
    .describe("MIME type for the object being uploaded"),
});

const PutPresignedUrlOutputSchema = z.object({
  url: z.string().describe("Presigned URL for uploading the object"),
  expiresIn: z.number().describe("Expiration time in seconds that was used"),
});

export type PutPresignedUrlInput = z.infer<typeof PutPresignedUrlInputSchema>;
export type PutPresignedUrlOutput = z.infer<typeof PutPresignedUrlOutputSchema>;

/**
 * DELETE_OBJECT - Delete a single object
 */
const DeleteObjectInputSchema = z.object({
  key: z.string().describe("Object key/path to delete"),
});

const DeleteObjectOutputSchema = z.object({
  success: z.boolean().describe("Whether the deletion was successful"),
  key: z.string().describe("The key that was deleted"),
});

export type DeleteObjectInput = z.infer<typeof DeleteObjectInputSchema>;
export type DeleteObjectOutput = z.infer<typeof DeleteObjectOutputSchema>;

/**
 * DELETE_OBJECTS - Delete multiple objects in batch
 */
const DeleteObjectsInputSchema = z.object({
  keys: z
    .array(z.string())
    .max(1000)
    .describe("Array of object keys/paths to delete (max 1000)"),
});

const DeleteObjectsOutputSchema = z.object({
  deleted: z.array(z.string()).describe("Array of successfully deleted keys"),
  errors: z
    .array(
      z.object({
        key: z.string(),
        message: z.string(),
      }),
    )
    .describe("Array of errors for failed deletions"),
});

export type DeleteObjectsInput = z.infer<typeof DeleteObjectsInputSchema>;
export type DeleteObjectsOutput = z.infer<typeof DeleteObjectsOutputSchema>;

// ============================================================================
// Binding Definition
// ============================================================================

/**
 * Object Storage Binding
 *
 * Defines the interface for S3-compatible object storage operations.
 * Any MCP that implements this binding can be used with the Object Storage plugin
 * to provide a file browser UI.
 *
 * Required tools:
 * - LIST_OBJECTS: List objects with prefix filtering and pagination
 * - GET_OBJECT_METADATA: Get object metadata (HEAD)
 * - GET_PRESIGNED_URL: Generate download URL
 * - PUT_PRESIGNED_URL: Generate upload URL
 * - DELETE_OBJECT: Delete single object
 * - DELETE_OBJECTS: Batch delete objects
 */
export const OBJECT_STORAGE_BINDING = [
  {
    name: "LIST_OBJECTS" as const,
    inputSchema: ListObjectsInputSchema,
    outputSchema: ListObjectsOutputSchema,
  } satisfies ToolBinder<"LIST_OBJECTS", ListObjectsInput, ListObjectsOutput>,
  {
    name: "GET_OBJECT_METADATA" as const,
    inputSchema: GetObjectMetadataInputSchema,
    outputSchema: GetObjectMetadataOutputSchema,
  } satisfies ToolBinder<
    "GET_OBJECT_METADATA",
    GetObjectMetadataInput,
    GetObjectMetadataOutput
  >,
  {
    name: "GET_PRESIGNED_URL" as const,
    inputSchema: GetPresignedUrlInputSchema,
    outputSchema: GetPresignedUrlOutputSchema,
  } satisfies ToolBinder<
    "GET_PRESIGNED_URL",
    GetPresignedUrlInput,
    GetPresignedUrlOutput
  >,
  {
    name: "PUT_PRESIGNED_URL" as const,
    inputSchema: PutPresignedUrlInputSchema,
    outputSchema: PutPresignedUrlOutputSchema,
  } satisfies ToolBinder<
    "PUT_PRESIGNED_URL",
    PutPresignedUrlInput,
    PutPresignedUrlOutput
  >,
  {
    name: "DELETE_OBJECT" as const,
    inputSchema: DeleteObjectInputSchema,
    outputSchema: DeleteObjectOutputSchema,
  } satisfies ToolBinder<
    "DELETE_OBJECT",
    DeleteObjectInput,
    DeleteObjectOutput
  >,
  {
    name: "DELETE_OBJECTS" as const,
    inputSchema: DeleteObjectsInputSchema,
    outputSchema: DeleteObjectsOutputSchema,
  } satisfies ToolBinder<
    "DELETE_OBJECTS",
    DeleteObjectsInput,
    DeleteObjectsOutput
  >,
] as const satisfies Binder;

export type ObjectStorageBinding = typeof OBJECT_STORAGE_BINDING;
