/**
 * Shared VM tool schemas — single source of truth for the six file-op tools
 * the LLM sees regardless of runner (Freestyle | Docker). Each runner's
 * transport file imports from here; drift between the two runner
 * implementations becomes a type error instead of a silent behavior split.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

export const ReadInputSchema = z.object({
  path: z
    .string()
    .describe("File path relative to project root (e.g. 'src/index.ts')"),
  offset: z
    .number()
    .optional()
    .describe("Starting line number (1-based, default 1)"),
  limit: z.number().optional().describe("Max lines to return (default 2000)"),
});

export const WriteInputSchema = z.object({
  path: z.string().describe("File path relative to project root"),
  content: z.string().describe("The full file content to write"),
});

export const EditInputSchema = z.object({
  path: z.string().describe("File path relative to project root"),
  old_string: z.string().describe("The exact text to find and replace"),
  new_string: z
    .string()
    .describe("The replacement text (must differ from old_string)"),
  replace_all: z
    .boolean()
    .optional()
    .describe("Replace all occurrences (default false)"),
});

export const GrepInputSchema = z.object({
  pattern: z.string().describe("Regex pattern to search for"),
  path: z
    .string()
    .optional()
    .describe("Directory or file to search in (default: project root)"),
  glob: z
    .string()
    .optional()
    .describe("Glob pattern to filter files (e.g. '*.ts', '*.{js,jsx}')"),
  context: z.number().optional().describe("Lines of context around matches"),
  ignore_case: z.boolean().optional().describe("Case-insensitive search"),
  output_mode: z
    .enum(["content", "files", "count"])
    .optional()
    .describe("Output mode (default: 'files')"),
  limit: z.number().optional().describe("Max result lines (default 250)"),
});

export const GlobInputSchema = z.object({
  pattern: z
    .string()
    .describe(
      "Glob pattern to match files (e.g. '**/*.ts', 'src/**/*.test.tsx')",
    ),
  path: z
    .string()
    .optional()
    .describe("Directory to search in (default: project root)"),
});

export const BashInputSchema = z.object({
  command: z.string().describe("The bash command to execute"),
  timeout: z
    .number()
    .optional()
    .describe("Timeout in milliseconds (default 30000, max 120000)"),
});

export type ReadInput = z.infer<typeof ReadInputSchema>;
export type WriteInput = z.infer<typeof WriteInputSchema>;
export type EditInput = z.infer<typeof EditInputSchema>;
export type GrepInput = z.infer<typeof GrepInputSchema>;
export type GlobInput = z.infer<typeof GlobInputSchema>;
export type BashInput = z.infer<typeof BashInputSchema>;

// ---------------------------------------------------------------------------
// Tool descriptions
// ---------------------------------------------------------------------------

export const READ_DESCRIPTION =
  "Read a file from the VM's project directory. Returns content with line numbers. " +
  "Use offset and limit for large files.";

export const WRITE_DESCRIPTION =
  "Write content to a file in the VM's project directory. " +
  "Creates parent directories if needed. Overwrites existing files entirely.";

export const EDIT_DESCRIPTION =
  "Perform exact string replacement in a file in the VM. " +
  "old_string must be unique in the file unless replace_all is true.";

export const GREP_DESCRIPTION =
  "Search file contents in the VM using ripgrep. " +
  "Supports regex patterns, file type filtering via glob, and context lines.";

export const GLOB_DESCRIPTION =
  "Find files by name pattern in the VM's project directory. " +
  "Uses ripgrep for gitignore-aware matching. Returns relative file paths.";

export const BASH_DESCRIPTION =
  "Execute a shell command in the VM's project directory. " +
  "Working directory is the project root. Timeout default 30s, max 2min.";

// ---------------------------------------------------------------------------
// needsApproval matrix (read/grep/glob are non-mutating; write/edit/bash mutate)
// ---------------------------------------------------------------------------

export const TOOL_APPROVAL = {
  read: false,
  write: true,
  edit: true,
  grep: false,
  glob: false,
  bash: true,
} as const;
