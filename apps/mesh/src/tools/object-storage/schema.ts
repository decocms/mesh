import { z } from "zod";
import type { MeshContext } from "../../core/mesh-context";
import type { BoundObjectStorage } from "../../object-storage/bound-object-storage";

export function requireObjectStorage(ctx: MeshContext): BoundObjectStorage {
  if (!ctx.objectStorage) {
    throw new Error(
      "Object storage is not configured. Ensure S3 credentials are set.",
    );
  }
  return ctx.objectStorage;
}

export const ListObjectsInputSchema = z.object({
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
  delimiter: z
    .string()
    .optional()
    .describe(
      "Delimiter for grouping keys (typically '/'). When set, commonPrefixes returns folder paths.",
    ),
});

export const ListObjectsOutputSchema = z.object({
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
  commonPrefixes: z
    .array(z.string())
    .optional()
    .describe(
      "Folder paths when delimiter is used (e.g., ['photos/2024/', 'photos/2025/'])",
    ),
});

export const GetObjectMetadataInputSchema = z.object({
  key: z.string().describe("Object key/path to get metadata for"),
});

export const GetObjectMetadataOutputSchema = z.object({
  contentType: z.string().optional().describe("MIME type of the object"),
  contentLength: z.number().describe("Size of the object in bytes"),
  lastModified: z.string().describe("Last modified timestamp"),
  etag: z.string().describe("Entity tag for the object"),
  metadata: z
    .record(z.string(), z.string())
    .optional()
    .describe("Custom metadata key-value pairs"),
});

export const GetPresignedUrlInputSchema = z.object({
  key: z.string().describe("Object key/path to generate URL for"),
  expiresIn: z
    .number()
    .optional()
    .describe("URL expiration time in seconds (default: 3600)"),
});

export const GetPresignedUrlOutputSchema = z.object({
  url: z.string().describe("Presigned URL for downloading the object"),
  expiresIn: z.number().describe("Expiration time in seconds that was used"),
});

export const PutPresignedUrlInputSchema = z.object({
  key: z.string().describe("Object key/path for the upload"),
  expiresIn: z
    .number()
    .optional()
    .describe("URL expiration time in seconds (default: 3600)"),
  contentType: z
    .string()
    .optional()
    .describe("MIME type for the object being uploaded"),
});

export const PutPresignedUrlOutputSchema = z.object({
  url: z.string().describe("Presigned URL for uploading the object"),
  expiresIn: z.number().describe("Expiration time in seconds that was used"),
});

export const DeleteObjectInputSchema = z.object({
  key: z.string().describe("Object key/path to delete"),
});

export const DeleteObjectOutputSchema = z.object({
  success: z.boolean().describe("Whether the deletion was successful"),
  key: z.string().describe("The key that was deleted"),
});

export const DeleteObjectsInputSchema = z.object({
  keys: z
    .array(z.string())
    .max(1000)
    .describe("Array of object keys/paths to delete (max 1000)"),
});

export const DeleteObjectsOutputSchema = z.object({
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
