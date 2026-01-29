/**
 * MCP Filesystem Binding
 *
 * Matches the official @modelcontextprotocol/server-filesystem tools.
 * Any MCP that implements this binding (including our local-fs) can be used
 * as a drop-in replacement for Claude Desktop filesystem access.
 *
 * This binding includes:
 * - read_file: Read file content (required)
 * - write_file: Write file content (required)
 * - list_directory: List directory contents (optional)
 * - create_directory: Create directories (optional)
 * - move_file: Move/rename files (optional)
 * - search_files: Search for files (optional)
 * - get_file_info: Get file metadata (optional)
 * - edit_file: Make line-based edits (optional)
 */

import { z } from "zod";
import type { Binder, ToolBinder } from "../core/binder";

// ============================================================================
// Tool Schemas (matching official @modelcontextprotocol/server-filesystem)
// ============================================================================

/**
 * read_file - Read file content
 */
const ReadFileInputSchema = z.object({
  path: z.string().describe("Path to the file to read"),
});

const ReadFileOutputSchema = z.object({
  content: z.array(
    z.object({
      type: z.literal("text"),
      text: z.string(),
    }),
  ),
});

export type ReadFileInput = z.infer<typeof ReadFileInputSchema>;
export type ReadFileOutput = z.infer<typeof ReadFileOutputSchema>;

/**
 * write_file - Write file content
 */
const WriteFileInputSchema = z.object({
  path: z.string().describe("Path where the file should be written"),
  content: z.string().describe("Content to write to the file"),
});

const WriteFileOutputSchema = z.object({
  content: z.array(
    z.object({
      type: z.literal("text"),
      text: z.string(),
    }),
  ),
});

export type WriteFileInput = z.infer<typeof WriteFileInputSchema>;
export type WriteFileOutput = z.infer<typeof WriteFileOutputSchema>;

/**
 * list_directory - List directory contents
 */
const ListDirInputSchema = z.object({
  path: z.string().describe("Path of the directory to list"),
});

const ListDirOutputSchema = z.object({
  content: z.array(
    z.object({
      type: z.literal("text"),
      text: z.string(),
    }),
  ),
});

export type ListDirInput = z.infer<typeof ListDirInputSchema>;
export type ListDirOutput = z.infer<typeof ListDirOutputSchema>;

/**
 * create_directory - Create directories
 */
const CreateDirInputSchema = z.object({
  path: z.string().describe("Path of the directory to create"),
});

const CreateDirOutputSchema = z.object({
  content: z.array(
    z.object({
      type: z.literal("text"),
      text: z.string(),
    }),
  ),
});

export type CreateDirInput = z.infer<typeof CreateDirInputSchema>;
export type CreateDirOutput = z.infer<typeof CreateDirOutputSchema>;

// ============================================================================
// Binding Definition
// ============================================================================

/**
 * MCP Filesystem Binding
 *
 * Matches the official @modelcontextprotocol/server-filesystem.
 * Use this binding when you need filesystem access that's compatible with
 * Claude Desktop and the official MCP filesystem server.
 *
 * Required tools:
 * - read_file: Read file content
 * - write_file: Write file content
 *
 * Optional tools:
 * - list_directory: List directory contents
 * - create_directory: Create directories
 */
export const MCP_FILESYSTEM_BINDING = [
  {
    name: "read_file" as const,
    inputSchema: ReadFileInputSchema,
    outputSchema: ReadFileOutputSchema,
  } satisfies ToolBinder<"read_file", ReadFileInput, ReadFileOutput>,
  {
    name: "write_file" as const,
    inputSchema: WriteFileInputSchema,
    outputSchema: WriteFileOutputSchema,
  } satisfies ToolBinder<"write_file", WriteFileInput, WriteFileOutput>,
  {
    name: "list_directory" as const,
    inputSchema: ListDirInputSchema,
    outputSchema: ListDirOutputSchema,
    opt: true,
  } satisfies ToolBinder<"list_directory", ListDirInput, ListDirOutput>,
  {
    name: "create_directory" as const,
    inputSchema: CreateDirInputSchema,
    outputSchema: CreateDirOutputSchema,
    opt: true,
  } satisfies ToolBinder<"create_directory", CreateDirInput, CreateDirOutput>,
] as const satisfies Binder;

export type McpFilesystemBinding = typeof MCP_FILESYSTEM_BINDING;
