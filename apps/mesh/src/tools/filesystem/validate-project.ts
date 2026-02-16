/**
 * FILESYSTEM_VALIDATE_PROJECT Tool
 *
 * Validates that a directory is a valid TypeScript project by checking
 * for the presence of tsconfig.json and package.json.
 */

import { stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";

const InputSchema = z.object({
  path: z.string().describe("Absolute path to project directory"),
});

const OutputSchema = z.object({
  valid: z.boolean(),
  error: z
    .enum(["PATH_NOT_FOUND", "MISSING_TSCONFIG", "MISSING_PACKAGE_JSON"])
    .nullable(),
});

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const s = await stat(filePath);
    return s.isFile();
  } catch {
    return false;
  }
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const s = await stat(dirPath);
    return s.isDirectory();
  } catch {
    return false;
  }
}

export const FILESYSTEM_VALIDATE_PROJECT = defineTool({
  name: "FILESYSTEM_VALIDATE_PROJECT",
  description:
    "Validate that a directory is a valid TypeScript project (has tsconfig.json and package.json)",
  annotations: {
    title: "Validate Project",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  handler: async (input, ctx) => {
    await ctx.access.check();
    requireAuth(ctx);

    if (!(await dirExists(input.path))) {
      return { valid: false, error: "PATH_NOT_FOUND" as const };
    }

    if (!(await fileExists(join(input.path, "tsconfig.json")))) {
      return { valid: false, error: "MISSING_TSCONFIG" as const };
    }

    if (!(await fileExists(join(input.path, "package.json")))) {
      return { valid: false, error: "MISSING_PACKAGE_JSON" as const };
    }

    return { valid: true, error: null };
  },
});
