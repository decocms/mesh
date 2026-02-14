/**
 * Site Well-Known Binding
 *
 * Defines the interface for site file operations (read, write, list).
 * Any MCP that implements this binding can provide file management
 * for a site's pages, sections, and loaders.
 *
 * This binding includes:
 * - READ_FILE: Read a file's content by path
 * - PUT_FILE: Write content to a file by path
 * - LIST_FILES: List files with optional prefix filtering
 */

import { z } from "zod";
import type { Binder, ToolBinder } from "../core/binder";

// ============================================================================
// Tool Schemas
// ============================================================================

/**
 * READ_FILE - Read a file's content by path
 */
const ReadFileInputSchema = z.object({
  path: z.string().describe("File path relative to project root"),
});

const ReadFileOutputSchema = z.object({
  content: z.string().describe("File content as UTF-8 string"),
});

export type ReadFileInput = z.infer<typeof ReadFileInputSchema>;
export type ReadFileOutput = z.infer<typeof ReadFileOutputSchema>;

/**
 * PUT_FILE - Write content to a file by path
 */
const PutFileInputSchema = z.object({
  path: z.string().describe("File path relative to project root"),
  content: z.string().describe("File content as UTF-8 string"),
});

const PutFileOutputSchema = z.object({
  success: z.boolean().describe("Whether the write succeeded"),
});

export type PutFileInput = z.infer<typeof PutFileInputSchema>;
export type PutFileOutput = z.infer<typeof PutFileOutputSchema>;

/**
 * LIST_FILES - List files with optional prefix filtering
 */
const ListFilesInputSchema = z.object({
  prefix: z
    .string()
    .optional()
    .describe("Path prefix filter (e.g., '.deco/pages/')"),
});

const ListFilesOutputSchema = z.object({
  files: z.array(
    z.object({
      path: z.string().describe("File path relative to project root"),
      sizeInBytes: z.number().describe("File size"),
      mtime: z.number().describe("Last modified timestamp (epoch ms)"),
    }),
  ),
  count: z.number().describe("Total file count"),
});

export type ListFilesInput = z.infer<typeof ListFilesInputSchema>;
export type ListFilesOutput = z.infer<typeof ListFilesOutputSchema>;

// ============================================================================
// Binding Definition
// ============================================================================

/**
 * Site Binding
 *
 * Defines the interface for site file operations.
 * Any MCP that implements this binding can be used with the Site Editor plugin
 * to provide a CMS UI for managing pages, sections, and loaders.
 *
 * Required tools:
 * - READ_FILE: Read a file's content
 * - PUT_FILE: Write content to a file
 * - LIST_FILES: List files with prefix filtering
 */
export const SITE_BINDING = [
  {
    name: "READ_FILE" as const,
    inputSchema: ReadFileInputSchema,
    outputSchema: ReadFileOutputSchema,
  } satisfies ToolBinder<"READ_FILE", ReadFileInput, ReadFileOutput>,
  {
    name: "PUT_FILE" as const,
    inputSchema: PutFileInputSchema,
    outputSchema: PutFileOutputSchema,
  } satisfies ToolBinder<"PUT_FILE", PutFileInput, PutFileOutput>,
  {
    name: "LIST_FILES" as const,
    inputSchema: ListFilesInputSchema,
    outputSchema: ListFilesOutputSchema,
  } satisfies ToolBinder<"LIST_FILES", ListFilesInput, ListFilesOutput>,
] as const satisfies Binder;

export type SiteBinding = typeof SITE_BINDING;
