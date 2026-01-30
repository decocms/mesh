/**
 * Mesh Session Management
 *
 * Stores and retrieves Mesh authentication sessions.
 * Separate from the legacy Supabase session.
 */

import { join } from "path";
import { homedir } from "os";
import { promises as fs } from "fs";
import { z } from "zod";
import process from "node:process";

const MeshSessionSchema = z.object({
  meshUrl: z.string(),
  token: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string().optional(),
    name: z.string().optional(),
  }),
  expiresAt: z.string().optional(),
  organizationId: z.string().optional(),
  organizationSlug: z.string().optional(),
});

export type MeshSession = z.infer<typeof MeshSessionSchema>;

/**
 * Path to the Mesh session file
 */
function getMeshSessionPath(): string {
  return join(homedir(), ".deco_mesh_session.json");
}

/**
 * Save Mesh session to disk
 */
export async function saveMeshSession(session: MeshSession): Promise<void> {
  const sessionPath = getMeshSessionPath();
  await fs.writeFile(sessionPath, JSON.stringify(session, null, 2));

  // Set file permissions to 600 (read/write for user only)
  if (process.platform !== "win32") {
    try {
      await fs.chmod(sessionPath, 0o600);
    } catch (error) {
      console.warn(
        "Warning: Could not set file permissions on session file:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

/**
 * Read Mesh session from disk
 */
export async function readMeshSession(): Promise<MeshSession | null> {
  // Check for token in environment first
  const envToken = process.env.MESH_TOKEN;
  const envUrl = process.env.MESH_URL;
  if (envToken && envUrl) {
    return {
      meshUrl: envUrl,
      token: envToken,
      user: { id: "env" },
    };
  }

  try {
    const sessionPath = getMeshSessionPath();
    const content = await fs.readFile(sessionPath, "utf-8");
    const parsed = MeshSessionSchema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Delete Mesh session
 */
export async function deleteMeshSession(): Promise<void> {
  try {
    const sessionPath = getMeshSessionPath();
    await fs.unlink(sessionPath);
  } catch {
    // Session file doesn't exist, that's fine
  }
}

/**
 * Get auth headers for Mesh API requests
 */
export async function getMeshAuthHeaders(): Promise<Record<string, string>> {
  const session = await readMeshSession();

  if (!session) {
    throw new Error("Not logged in to Mesh. Run 'deco mesh login' first.");
  }

  return {
    Authorization: `Bearer ${session.token}`,
  };
}

/**
 * Get Mesh URL from session or environment
 */
export async function getMeshUrl(): Promise<string> {
  const session = await readMeshSession();
  return session?.meshUrl || process.env.MESH_URL || "http://localhost:3000";
}

/**
 * Check if logged in to Mesh
 */
export async function isMeshLoggedIn(): Promise<boolean> {
  const session = await readMeshSession();
  return session !== null;
}

/**
 * Update the organization in an existing session
 */
export async function setMeshOrganization(
  organizationId: string,
  organizationSlug: string,
): Promise<void> {
  const session = await readMeshSession();
  if (!session) {
    throw new Error("Not logged in to Mesh");
  }
  session.organizationId = organizationId;
  session.organizationSlug = organizationSlug;
  await saveMeshSession(session);
}
