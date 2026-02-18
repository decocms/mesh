/**
 * Site Well-Known Binding
 *
 * Defines the interface for site file operations (read, write, list)
 * and branch lifecycle operations (create, list, merge, delete).
 * Any MCP that implements this binding can provide file management
 * for a site's pages, sections, and loaders.
 *
 * This binding includes:
 * - READ_FILE: Read a file's content by path
 * - PUT_FILE: Write content to a file by path
 * - LIST_FILES: List files with optional prefix filtering
 * - CREATE_BRANCH: Create a new branch (optional)
 * - LIST_BRANCHES: List all branches (optional)
 * - MERGE_BRANCH: Merge a source branch into target (optional)
 * - DELETE_BRANCH: Delete a branch (optional)
 * - GET_FILE_HISTORY: Get commit history for a file (optional)
 * - READ_FILE_AT: Read a file at a specific commit (optional)
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
// Branch Tool Schemas (optional -- not all MCPs support branches)
// ============================================================================

/**
 * CREATE_BRANCH - Create a new branch
 */
const CreateBranchInputSchema = z.object({
  name: z.string().describe("Branch name to create"),
  from: z
    .string()
    .optional()
    .describe("Source branch to create from (defaults to 'main')"),
});

const CreateBranchOutputSchema = z.object({
  success: z.boolean().describe("Whether the branch was created"),
  branch: z.string().describe("Name of the created branch"),
});

export type CreateBranchInput = z.infer<typeof CreateBranchInputSchema>;
export type CreateBranchOutput = z.infer<typeof CreateBranchOutputSchema>;

/**
 * LIST_BRANCHES - List all branches
 */
const ListBranchesInputSchema = z.object({});

const ListBranchesOutputSchema = z.object({
  branches: z.array(
    z.object({
      name: z.string().describe("Branch name"),
      isDefault: z.boolean().describe("Whether this is the default branch"),
    }),
  ),
});

export type ListBranchesInput = z.infer<typeof ListBranchesInputSchema>;
export type ListBranchesOutput = z.infer<typeof ListBranchesOutputSchema>;

/**
 * MERGE_BRANCH - Merge a source branch into a target branch
 */
const MergeBranchInputSchema = z.object({
  source: z.string().describe("Source branch to merge from"),
  target: z
    .string()
    .optional()
    .describe("Target branch to merge into (defaults to 'main')"),
  deleteSource: z
    .boolean()
    .optional()
    .describe("Whether to delete the source branch after merge"),
});

const MergeBranchOutputSchema = z.object({
  success: z.boolean().describe("Whether the merge succeeded"),
  message: z.string().optional().describe("Additional merge details"),
});

export type MergeBranchInput = z.infer<typeof MergeBranchInputSchema>;
export type MergeBranchOutput = z.infer<typeof MergeBranchOutputSchema>;

/**
 * DELETE_BRANCH - Delete a branch
 */
const DeleteBranchInputSchema = z.object({
  name: z.string().describe("Branch name to delete"),
});

const DeleteBranchOutputSchema = z.object({
  success: z.boolean().describe("Whether the branch was deleted"),
});

export type DeleteBranchInput = z.infer<typeof DeleteBranchInputSchema>;
export type DeleteBranchOutput = z.infer<typeof DeleteBranchOutputSchema>;

// ============================================================================
// History Tool Schemas (optional -- not all MCPs support file history)
// ============================================================================

/**
 * GET_FILE_HISTORY - Get commit history for a file
 */
const GetFileHistoryInputSchema = z.object({
  path: z.string().describe("File path relative to project root"),
  branch: z.string().optional().describe("Branch name (defaults to current)"),
  limit: z
    .number()
    .optional()
    .describe("Max entries to return (defaults to 50)"),
});

const GetFileHistoryOutputSchema = z.object({
  entries: z.array(
    z.object({
      commitHash: z.string().describe("Git commit SHA"),
      timestamp: z.number().describe("Commit timestamp (epoch ms)"),
      author: z.string().describe("Commit author name"),
      message: z.string().describe("Commit message"),
    }),
  ),
});

export type GetFileHistoryInput = z.infer<typeof GetFileHistoryInputSchema>;
export type GetFileHistoryOutput = z.infer<typeof GetFileHistoryOutputSchema>;

/**
 * READ_FILE_AT - Read a file's content at a specific commit
 */
const ReadFileAtInputSchema = z.object({
  path: z.string().describe("File path relative to project root"),
  commitHash: z.string().describe("Git commit SHA to read from"),
});

const ReadFileAtOutputSchema = z.object({
  content: z.string().describe("File content at the specified commit"),
});

export type ReadFileAtInput = z.infer<typeof ReadFileAtInputSchema>;
export type ReadFileAtOutput = z.infer<typeof ReadFileAtOutputSchema>;

// ============================================================================
// Git Tool Schemas (optional -- git-native editing, phases 12-14)
// ============================================================================

/**
 * GIT_STATUS - Return working-tree status
 */
const GitStatusInputSchema = z.object({
  path: z
    .string()
    .optional()
    .describe(
      "File or directory path relative to project root. Defaults to full repo.",
    ),
});

const GitStatusOutputSchema = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      oldPath: z.string().optional(),
      staged: z
        .enum(["modified", "added", "deleted", "untracked", "renamed"])
        .nullable(),
      unstaged: z
        .enum(["modified", "added", "deleted", "untracked", "renamed"])
        .nullable(),
    }),
  ),
});

export type GitStatusInput = z.infer<typeof GitStatusInputSchema>;
export type GitStatusOutput = z.infer<typeof GitStatusOutputSchema>;

/**
 * GIT_DIFF - Return unified diff between working tree and HEAD
 */
const GitDiffInputSchema = z.object({
  path: z
    .string()
    .optional()
    .describe("File path relative to project root. Defaults to full repo."),
});

const GitDiffOutputSchema = z.object({
  diff: z.string().describe("Raw unified diff output"),
});

export type GitDiffInput = z.infer<typeof GitDiffInputSchema>;
export type GitDiffOutput = z.infer<typeof GitDiffOutputSchema>;

/**
 * GIT_LOG - Return commit history for a file or repo
 */
const GitLogInputSchema = z.object({
  path: z
    .string()
    .optional()
    .describe("File path relative to project root. Omit for full repo log."),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of commits to return (default 50)."),
});

const GitLogOutputSchema = z.object({
  commits: z.array(
    z.object({
      hash: z.string(),
      author: z.string(),
      date: z.string(),
      message: z.string(),
    }),
  ),
});

export type GitLogInput = z.infer<typeof GitLogInputSchema>;
export type GitLogOutput = z.infer<typeof GitLogOutputSchema>;

/**
 * GIT_SHOW - Return file content at a specific commit
 */
const GitShowInputSchema = z.object({
  path: z.string().describe("File path relative to project root."),
  commitHash: z.string().describe("Git commit SHA to read from."),
});

const GitShowOutputSchema = z.object({
  content: z.string().describe("File content at the specified commit."),
});

export type GitShowInput = z.infer<typeof GitShowInputSchema>;
export type GitShowOutput = z.infer<typeof GitShowOutputSchema>;

/**
 * GIT_CHECKOUT - Revert file to HEAD or a specified commit
 */
const GitCheckoutInputSchema = z.object({
  path: z.string().describe("File path relative to project root."),
  commitHash: z
    .string()
    .optional()
    .describe("Commit to restore from. Defaults to HEAD."),
  force: z
    .boolean()
    .optional()
    .describe("Must be true to confirm destructive operation."),
});

const GitCheckoutOutputSchema = z.object({
  path: z.string(),
  ref: z.string(),
});

export type GitCheckoutInput = z.infer<typeof GitCheckoutInputSchema>;
export type GitCheckoutOutput = z.infer<typeof GitCheckoutOutputSchema>;

/**
 * GIT_COMMIT - Stage all changes and create a commit
 */
const GitCommitInputSchema = z.object({
  message: z.string().describe("Commit message."),
});

const GitCommitOutputSchema = z.object({
  hash: z.string().describe("New commit hash."),
  message: z.string().describe("Commit message."),
});

export type GitCommitInput = z.infer<typeof GitCommitInputSchema>;
export type GitCommitOutput = z.infer<typeof GitCommitOutputSchema>;

// ============================================================================
// Binding Definition
// ============================================================================

/**
 * Site Binding
 *
 * Defines the interface for site file operations and branch lifecycle.
 * Any MCP that implements this binding can be used with the Site Editor plugin
 * to provide a CMS UI for managing pages, sections, and loaders.
 *
 * Required tools:
 * - READ_FILE: Read a file's content
 * - PUT_FILE: Write content to a file
 * - LIST_FILES: List files with prefix filtering
 *
 * Optional tools (branch lifecycle):
 * - CREATE_BRANCH: Create a new branch
 * - LIST_BRANCHES: List all branches
 * - MERGE_BRANCH: Merge source branch into target
 * - DELETE_BRANCH: Delete a branch
 *
 * Optional tools (file history):
 * - GET_FILE_HISTORY: Get commit history for a file
 * - READ_FILE_AT: Read a file at a specific commit
 */
export const SITE_BINDING = [
  {
    name: "READ_FILE" as const,
    inputSchema: ReadFileInputSchema,
    outputSchema: ReadFileOutputSchema,
    aliases: ["read_file"],
  } satisfies ToolBinder<"READ_FILE", ReadFileInput, ReadFileOutput>,
  {
    name: "PUT_FILE" as const,
    inputSchema: PutFileInputSchema,
    outputSchema: PutFileOutputSchema,
    aliases: ["write_file"],
  } satisfies ToolBinder<"PUT_FILE", PutFileInput, PutFileOutput>,
  {
    name: "LIST_FILES" as const,
    inputSchema: ListFilesInputSchema,
    outputSchema: ListFilesOutputSchema,
    aliases: ["list_directory"],
  } satisfies ToolBinder<"LIST_FILES", ListFilesInput, ListFilesOutput>,
  {
    name: "CREATE_BRANCH" as const,
    inputSchema: CreateBranchInputSchema,
    outputSchema: CreateBranchOutputSchema,
    opt: true,
  } satisfies ToolBinder<
    "CREATE_BRANCH",
    CreateBranchInput,
    CreateBranchOutput
  >,
  {
    name: "LIST_BRANCHES" as const,
    inputSchema: ListBranchesInputSchema,
    outputSchema: ListBranchesOutputSchema,
    opt: true,
  } satisfies ToolBinder<
    "LIST_BRANCHES",
    ListBranchesInput,
    ListBranchesOutput
  >,
  {
    name: "MERGE_BRANCH" as const,
    inputSchema: MergeBranchInputSchema,
    outputSchema: MergeBranchOutputSchema,
    opt: true,
  } satisfies ToolBinder<"MERGE_BRANCH", MergeBranchInput, MergeBranchOutput>,
  {
    name: "DELETE_BRANCH" as const,
    inputSchema: DeleteBranchInputSchema,
    outputSchema: DeleteBranchOutputSchema,
    opt: true,
  } satisfies ToolBinder<
    "DELETE_BRANCH",
    DeleteBranchInput,
    DeleteBranchOutput
  >,
  {
    name: "GET_FILE_HISTORY" as const,
    inputSchema: GetFileHistoryInputSchema,
    outputSchema: GetFileHistoryOutputSchema,
    opt: true,
  } satisfies ToolBinder<
    "GET_FILE_HISTORY",
    GetFileHistoryInput,
    GetFileHistoryOutput
  >,
  {
    name: "READ_FILE_AT" as const,
    inputSchema: ReadFileAtInputSchema,
    outputSchema: ReadFileAtOutputSchema,
    opt: true,
  } satisfies ToolBinder<"READ_FILE_AT", ReadFileAtInput, ReadFileAtOutput>,
  {
    name: "GIT_STATUS" as const,
    inputSchema: GitStatusInputSchema,
    outputSchema: GitStatusOutputSchema,
    opt: true,
  } satisfies ToolBinder<"GIT_STATUS", GitStatusInput, GitStatusOutput>,
  {
    name: "GIT_DIFF" as const,
    inputSchema: GitDiffInputSchema,
    outputSchema: GitDiffOutputSchema,
    opt: true,
  } satisfies ToolBinder<"GIT_DIFF", GitDiffInput, GitDiffOutput>,
  {
    name: "GIT_LOG" as const,
    inputSchema: GitLogInputSchema,
    outputSchema: GitLogOutputSchema,
    opt: true,
  } satisfies ToolBinder<"GIT_LOG", GitLogInput, GitLogOutput>,
  {
    name: "GIT_SHOW" as const,
    inputSchema: GitShowInputSchema,
    outputSchema: GitShowOutputSchema,
    opt: true,
  } satisfies ToolBinder<"GIT_SHOW", GitShowInput, GitShowOutput>,
  {
    name: "GIT_CHECKOUT" as const,
    inputSchema: GitCheckoutInputSchema,
    outputSchema: GitCheckoutOutputSchema,
    opt: true,
  } satisfies ToolBinder<"GIT_CHECKOUT", GitCheckoutInput, GitCheckoutOutput>,
  {
    name: "GIT_COMMIT" as const,
    inputSchema: GitCommitInputSchema,
    outputSchema: GitCommitOutputSchema,
    opt: true,
  } satisfies ToolBinder<"GIT_COMMIT", GitCommitInput, GitCommitOutput>,
] as const satisfies Binder;

export type SiteBinding = typeof SITE_BINDING;
