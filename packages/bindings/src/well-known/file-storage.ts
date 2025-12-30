/**
 * File Storage Well-Known Binding
 *
 * Defines the interface for file storage operations via MCP.
 * Any MCP that implements this binding can store, retrieve, and manage files.
 *
 * This binding includes:
 * - FILE_READ: Read file content
 * - FILE_WRITE: Write/upload file content
 * - FILE_DELETE: Delete file or directory
 * - FILE_MOVE: Move/rename files (optional)
 * - FILE_COPY: Copy files (optional)
 * - FILE_MKDIR: Create directories (optional)
 * - FILE_UPLOAD_URL: Get pre-signed upload URL (optional)
 */

import { z } from "zod";
import { bindingClient, type ToolBinder } from "../core/binder";
import {
  createCollectionBindings,
  type CollectionListInput,
} from "./collections";

// ============================================================================
// Entity Schemas
// ============================================================================

/**
 * File entity schema - metadata for a file or folder
 */
export const FileEntitySchema = z.object({
  /** Unique file path (serves as ID) */
  id: z.string().describe("Unique file path/identifier"),

  /** Display name */
  title: z.string().describe("File name"),

  /** Optional description */
  description: z.string().nullish(),

  /** File path relative to storage root */
  path: z.string().describe("File path relative to storage root"),

  /** Parent folder path (empty string for root) */
  parent: z.string().describe("Parent folder path"),

  /** MIME type */
  mimeType: z.string().describe("MIME type of the file"),

  /** File size in bytes */
  size: z.number().describe("File size in bytes"),

  /** Whether this is a directory */
  isDirectory: z.boolean().describe("Whether this is a directory"),

  /** Created timestamp */
  created_at: z.string().datetime(),

  /** Updated timestamp */
  updated_at: z.string().datetime(),

  /** Optional URL for direct access (pre-signed URL or public URL) */
  url: z.string().url().optional().describe("Direct access URL"),

  /** Optional thumbnail URL for images */
  thumbnailUrl: z.string().url().optional(),
});

export type FileEntity = z.infer<typeof FileEntitySchema>;

/**
 * Folder entity schema (directory with item count)
 */
export const FolderEntitySchema = FileEntitySchema.extend({
  isDirectory: z.literal(true),
  /** Number of items in folder */
  itemCount: z.number().optional().describe("Number of items in folder"),
});

export type FolderEntity = z.infer<typeof FolderEntitySchema>;

// ============================================================================
// FILE_READ Schemas
// ============================================================================

/**
 * FILE_READ Input - Read file content
 */
export const FileReadInputSchema = z.object({
  /** File path to read */
  path: z.string().describe("File path to read"),

  /** Encoding for text files (default: utf-8) */
  encoding: z
    .enum(["utf-8", "base64", "binary"])
    .optional()
    .default("utf-8")
    .describe("Content encoding"),
});

export type FileReadInput = z.infer<typeof FileReadInputSchema>;

export const FileReadOutputSchema = z.object({
  /** File content (text or base64 encoded) */
  content: z.string().describe("File content"),

  /** File metadata */
  metadata: FileEntitySchema,
});

export type FileReadOutput = z.infer<typeof FileReadOutputSchema>;

// ============================================================================
// FILE_WRITE Schemas
// ============================================================================

/**
 * FILE_WRITE Input - Write/upload file
 */
export const FileWriteInputSchema = z.object({
  /** File path to write */
  path: z.string().describe("File path to write"),

  /** File content (text or base64 encoded) */
  content: z.string().describe("File content (text or base64)"),

  /** Content encoding */
  encoding: z
    .enum(["utf-8", "base64"])
    .optional()
    .default("utf-8")
    .describe("Content encoding"),

  /** MIME type (auto-detected if not provided) */
  mimeType: z
    .string()
    .optional()
    .describe("MIME type (auto-detected if omitted)"),

  /** Whether to create parent directories if they don't exist */
  createParents: z
    .boolean()
    .optional()
    .default(true)
    .describe("Create parent directories if needed"),

  /** Whether to overwrite if file exists */
  overwrite: z
    .boolean()
    .optional()
    .default(true)
    .describe("Overwrite existing file"),
});

export type FileWriteInput = z.infer<typeof FileWriteInputSchema>;

export const FileWriteOutputSchema = z.object({
  /** Written file metadata */
  file: FileEntitySchema,
});

export type FileWriteOutput = z.infer<typeof FileWriteOutputSchema>;

// ============================================================================
// FILE_DELETE Schemas
// ============================================================================

/**
 * FILE_DELETE Input
 */
export const FileDeleteInputSchema = z.object({
  /** Path to delete */
  path: z.string().describe("Path to delete"),

  /** Whether to recursively delete directories */
  recursive: z
    .boolean()
    .optional()
    .default(false)
    .describe("Recursively delete directories"),
});

export type FileDeleteInput = z.infer<typeof FileDeleteInputSchema>;

export const FileDeleteOutputSchema = z.object({
  success: z.boolean(),
  path: z.string(),
  deletedCount: z.number().optional(),
});

export type FileDeleteOutput = z.infer<typeof FileDeleteOutputSchema>;

// ============================================================================
// FILE_MOVE Schemas
// ============================================================================

/**
 * FILE_MOVE Input - Move/rename file or folder
 */
export const FileMoveInputSchema = z.object({
  /** Source path */
  from: z.string().describe("Source path"),

  /** Destination path */
  to: z.string().describe("Destination path"),

  /** Whether to overwrite if destination exists */
  overwrite: z
    .boolean()
    .optional()
    .default(false)
    .describe("Overwrite if destination exists"),
});

export type FileMoveInput = z.infer<typeof FileMoveInputSchema>;

export const FileMoveOutputSchema = z.object({
  /** Moved file metadata */
  file: FileEntitySchema,
});

export type FileMoveOutput = z.infer<typeof FileMoveOutputSchema>;

// ============================================================================
// FILE_COPY Schemas
// ============================================================================

/**
 * FILE_COPY Input
 */
export const FileCopyInputSchema = z.object({
  /** Source path */
  from: z.string().describe("Source path"),

  /** Destination path */
  to: z.string().describe("Destination path"),

  /** Whether to overwrite if destination exists */
  overwrite: z
    .boolean()
    .optional()
    .default(false)
    .describe("Overwrite if destination exists"),
});

export type FileCopyInput = z.infer<typeof FileCopyInputSchema>;

export const FileCopyOutputSchema = z.object({
  /** Copied file metadata */
  file: FileEntitySchema,
});

export type FileCopyOutput = z.infer<typeof FileCopyOutputSchema>;

// ============================================================================
// FILE_MKDIR Schemas
// ============================================================================

/**
 * FILE_MKDIR Input - Create directory
 */
export const FileMkdirInputSchema = z.object({
  /** Directory path to create */
  path: z.string().describe("Directory path to create"),

  /** Whether to create parent directories */
  recursive: z
    .boolean()
    .optional()
    .default(true)
    .describe("Create parent directories"),
});

export type FileMkdirInput = z.infer<typeof FileMkdirInputSchema>;

export const FileMkdirOutputSchema = z.object({
  /** Created directory metadata */
  folder: FolderEntitySchema,
});

export type FileMkdirOutput = z.infer<typeof FileMkdirOutputSchema>;

// ============================================================================
// FILE_UPLOAD_URL Schemas (for direct uploads)
// ============================================================================

/**
 * FILE_UPLOAD_URL Input - Get a pre-signed URL for direct upload
 */
export const FileUploadUrlInputSchema = z.object({
  /** Target path for the upload */
  path: z.string().describe("Target path for upload"),

  /** MIME type of file to upload */
  mimeType: z.string().describe("MIME type"),

  /** File size in bytes (for validation) */
  size: z.number().optional().describe("File size in bytes"),

  /** URL expiration in seconds (default: 3600) */
  expiresIn: z
    .number()
    .optional()
    .default(3600)
    .describe("URL expiration in seconds"),
});

export type FileUploadUrlInput = z.infer<typeof FileUploadUrlInputSchema>;

export const FileUploadUrlOutputSchema = z.object({
  /** Pre-signed upload URL */
  uploadUrl: z.string().url(),

  /** HTTP method to use (PUT or POST) */
  method: z.enum(["PUT", "POST"]),

  /** Headers to include with the upload request */
  headers: z.record(z.string()).optional(),

  /** Form fields for multipart uploads */
  fields: z.record(z.string()).optional(),

  /** URL expiration timestamp */
  expiresAt: z.string().datetime(),

  /** Final path where file will be stored */
  path: z.string(),
});

export type FileUploadUrlOutput = z.infer<typeof FileUploadUrlOutputSchema>;

// ============================================================================
// FILE_STORAGE_BINDING Definition
// ============================================================================

/**
 * File Storage Binding
 *
 * Defines the interface for file storage operations.
 * Implementations must provide core file operations.
 *
 * Required tools:
 * - FILE_READ: Read file content
 * - FILE_WRITE: Write/upload file content
 * - FILE_DELETE: Delete file or directory
 *
 * Optional tools:
 * - FILE_MOVE: Move/rename files
 * - FILE_COPY: Copy files
 * - FILE_MKDIR: Create directories
 * - FILE_UPLOAD_URL: Get pre-signed upload URL (for direct uploads)
 */
export const FILE_STORAGE_BINDING = [
  {
    name: "FILE_READ" as const,
    inputSchema: FileReadInputSchema,
    outputSchema: FileReadOutputSchema,
  },
  {
    name: "FILE_WRITE" as const,
    inputSchema: FileWriteInputSchema,
    outputSchema: FileWriteOutputSchema,
  },
  {
    name: "FILE_DELETE" as const,
    inputSchema: FileDeleteInputSchema,
    outputSchema: FileDeleteOutputSchema,
  },
  {
    name: "FILE_MOVE" as const,
    inputSchema: FileMoveInputSchema,
    outputSchema: FileMoveOutputSchema,
    opt: true,
  },
  {
    name: "FILE_COPY" as const,
    inputSchema: FileCopyInputSchema,
    outputSchema: FileCopyOutputSchema,
    opt: true,
  },
  {
    name: "FILE_MKDIR" as const,
    inputSchema: FileMkdirInputSchema,
    outputSchema: FileMkdirOutputSchema,
    opt: true,
  },
  {
    name: "FILE_UPLOAD_URL" as const,
    inputSchema: FileUploadUrlInputSchema,
    outputSchema: FileUploadUrlOutputSchema,
    opt: true,
  },
] satisfies ToolBinder[];

/**
 * File Storage Binding Client
 *
 * Use this to create a client for interacting with a file storage provider.
 *
 * @example
 * ```typescript
 * import { FileStorageBinding } from "@decocms/bindings/file-storage";
 *
 * // For a connection
 * const client = FileStorageBinding.forConnection(connection);
 *
 * // Read a file
 * const file = await client.FILE_READ({ path: "docs/readme.md" });
 *
 * // Write a file
 * await client.FILE_WRITE({
 *   path: "uploads/image.png",
 *   content: base64Content,
 *   encoding: "base64",
 *   mimeType: "image/png"
 * });
 *
 * // Delete a file
 * await client.FILE_DELETE({ path: "temp/old-file.txt" });
 * ```
 */
export const FileStorageBinding = bindingClient(FILE_STORAGE_BINDING);

/**
 * Type helper for the File Storage binding client
 */
export type FileStorageBindingClient = ReturnType<
  typeof FileStorageBinding.forConnection
>;

// ============================================================================
// Collection Bindings for Files and Folders
// ============================================================================

/**
 * Files collection binding - for browsing files
 * Uses the standard collection pattern for LIST and GET
 */
export const FILES_COLLECTION_BINDING = createCollectionBindings(
  "files",
  FileEntitySchema,
  { readOnly: true },
);

/**
 * Folders collection binding - for browsing folders
 */
export const FOLDERS_COLLECTION_BINDING = createCollectionBindings(
  "folders",
  FolderEntitySchema,
  { readOnly: true },
);

// ============================================================================
// List Input Extension for Files (with parent filter)
// ============================================================================

/**
 * Extended list input for files collection with parent filter
 */
export const FilesListInputSchema = z.object({
  /** Filter by parent folder (empty string for root) */
  parent: z.string().optional().describe("Parent folder path"),
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional(),
});

export type FilesListInput = z.infer<typeof FilesListInputSchema>;

/**
 * Convert FilesListInput to standard CollectionListInput
 */
export function filesToCollectionInput(
  input: FilesListInput,
): CollectionListInput {
  return {
    where:
      input.parent !== undefined
        ? { field: ["parent"], operator: "eq", value: input.parent }
        : undefined,
    limit: input.limit,
    offset: input.offset,
  };
}
