/**
 * FILESYSTEM_PICK_DIRECTORY Tool
 *
 * Opens a native OS folder picker dialog and returns the selected absolute path.
 * Only works when the mesh server is running locally.
 *
 * macOS: uses osascript (AppleScript)
 * Linux: uses zenity
 * Windows: uses PowerShell
 */

import { exec } from "node:child_process";
import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";

const InputSchema = z.object({});

const OutputSchema = z.object({
  path: z.string().nullable(),
});

function openFolderDialog(): Promise<string | null> {
  const platform = process.platform;

  let command: string;
  if (platform === "darwin") {
    command = `osascript -e 'POSIX path of (choose folder with prompt "Select your project folder")'`;
  } else if (platform === "linux") {
    command = `zenity --file-selection --directory --title="Select your project folder"`;
  } else if (platform === "win32") {
    command = `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select your project folder'; if ($f.ShowDialog() -eq 'OK') { $f.SelectedPath } else { '' }"`;
  } else {
    return Promise.reject(new Error(`Unsupported platform: ${platform}`));
  }

  return new Promise((resolve, reject) => {
    exec(command, { timeout: 120_000 }, (error, stdout) => {
      if (error) {
        // User cancelled the dialog
        if (error.killed || error.code === 1) {
          resolve(null);
          return;
        }
        reject(error);
        return;
      }
      const selected = stdout.trim();
      // Remove trailing slash if present (except root "/")
      const cleaned =
        selected.length > 1 && selected.endsWith("/")
          ? selected.slice(0, -1)
          : selected;
      resolve(cleaned || null);
    });
  });
}

export const FILESYSTEM_PICK_DIRECTORY = defineTool({
  name: "FILESYSTEM_PICK_DIRECTORY",
  description:
    "Open a native OS folder picker dialog and return the selected path",
  annotations: {
    title: "Pick Directory",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  handler: async (_input, ctx) => {
    await ctx.access.check();
    requireAuth(ctx);

    const path = await openFolderDialog();
    return { path };
  },
});
