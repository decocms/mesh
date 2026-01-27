/**
 * Local Filesystem Well-Known Binding
 *
 * Defines the interface for local filesystem operations.
 * Any MCP that implements this binding can provide file management
 * for a mounted local directory.
 *
 * This binding includes:
 * - FILE_READ: Read file content
 * - FILE_WRITE: Write file content
 * - FILE_DELETE: Delete file or directory (optional)
 * - list_directory: List directory contents (optional)
 */

import { z } from "zod";
import type { Binder, ToolBinder } from "../core/binder";

// ============================================================================
// Tool Schemas
// ============================================================================

/**
 * FILE_READ - Read file content
 */
const FileReadInputSchema = z.object({
  path: z.string().describe("File path relative to storage root"),
  encoding: z
    .enum(["utf-8", "base64"])
    .default("utf-8")
    .describe("Content encoding"),
});

const FileReadOutputSchema = z.object({
  content: z.string().describe("File content"),
  metadata: z.object({
    id: z.string(),
    title: z.string(),
    path: z.string(),
    mimeType: z.string(),
    size: z.number(),
  }),
});

export type FileReadInput = z.infer<typeof FileReadInputSchema>;
export type FileReadOutput = z.infer<typeof FileReadOutputSchema>;

/**
 * FILE_WRITE - Write file content
 */
const FileWriteInputSchema = z.object({
  path: z.string().describe("File path relative to storage root"),
  content: z.string().describe("Content to write"),
  encoding: z
    .enum(["utf-8", "base64"])
    .default("utf-8")
    .describe("Content encoding"),
  createParents: z
    .boolean()
    .default(true)
    .describe("Create parent directories if needed"),
  overwrite: z.boolean().default(true).describe("Overwrite existing file"),
});

const FileWriteOutputSchema = z.object({
  file: z.object({
    id: z.string(),
    title: z.string(),
    path: z.string(),
    mimeType: z.string(),
    size: z.number(),
  }),
});

export type FileWriteInput = z.infer<typeof FileWriteInputSchema>;
export type FileWriteOutput = z.infer<typeof FileWriteOutputSchema>;

/**
 * FILE_DELETE - Delete file or directory
 */
const FileDeleteInputSchema = z.object({
  path: z.string().describe("Path to delete"),
  recursive: z
    .boolean()
    .default(false)
    .describe("Recursively delete directories"),
});

const FileDeleteOutputSchema = z.object({
  success: z.boolean(),
  path: z.string(),
});

export type FileDeleteInput = z.infer<typeof FileDeleteInputSchema>;
export type FileDeleteOutput = z.infer<typeof FileDeleteOutputSchema>;

/**
 * list_directory - List directory contents
 */
const ListDirectoryInputSchema = z.object({
  path: z.string().describe("Directory path to list"),
});

const ListDirectoryOutputSchema = z.object({
  content: z.string().describe("Directory listing as text"),
});

export type ListDirectoryInput = z.infer<typeof ListDirectoryInputSchema>;
export type ListDirectoryOutput = z.infer<typeof ListDirectoryOutputSchema>;

// ============================================================================
// Binding Definition
// ============================================================================

/**
 * Local FS Binding
 *
 * Defines the interface for local filesystem operations.
 * Any MCP that implements this binding can be used for file storage.
 *
 * Required tools:
 * - FILE_READ: Read file content
 * - FILE_WRITE: Write file content
 *
 * Optional tools:
 * - FILE_DELETE: Delete file or directory
 * - list_directory: List directory contents
 */
export const LOCAL_FS_BINDING = [
  {
    name: "FILE_READ" as const,
    inputSchema: FileReadInputSchema,
    outputSchema: FileReadOutputSchema,
  } satisfies ToolBinder<"FILE_READ", FileReadInput, FileReadOutput>,
  {
    name: "FILE_WRITE" as const,
    inputSchema: FileWriteInputSchema,
    outputSchema: FileWriteOutputSchema,
  } satisfies ToolBinder<"FILE_WRITE", FileWriteInput, FileWriteOutput>,
  {
    name: "FILE_DELETE" as const,
    inputSchema: FileDeleteInputSchema,
    outputSchema: FileDeleteOutputSchema,
    opt: true,
  } satisfies ToolBinder<"FILE_DELETE", FileDeleteInput, FileDeleteOutput>,
  {
    name: "list_directory" as const,
    inputSchema: ListDirectoryInputSchema,
    outputSchema: ListDirectoryOutputSchema,
    opt: true,
  } satisfies ToolBinder<
    "list_directory",
    ListDirectoryInput,
    ListDirectoryOutput
  >,
] as const satisfies Binder;

export type LocalFsBinding = typeof LOCAL_FS_BINDING;
