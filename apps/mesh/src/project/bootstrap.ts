/**
 * Project Bootstrap
 *
 * Orchestrates project scanning and agent creation on startup.
 * Runs after local-mode seeding when a projectDir is detected.
 */

import { join } from "path";
import { scanProject, type ProjectScanResult } from "./scanner";
import { PROJECT_AGENT_TEMPLATES } from "./agent-templates";
import { setScanResult } from "./state";
import { getDb } from "@/database";

/**
 * Bootstrap project agents for a detected project directory.
 *
 * - Scans the project to detect its stack
 * - Writes scan result to .deco/project.json
 * - Creates Virtual MCP agents for each applicable template (idempotent)
 */
export async function bootstrapProjectAgents(
  projectDir: string,
  organizationId: string,
  userId: string,
): Promise<{ scan: ProjectScanResult; agentIds: string[] }> {
  // 1. Scan the project
  const scan = await scanProject(projectDir);
  setScanResult(scan);

  console.log(
    `[project] Detected: ${scan.projectName} (${scan.framework ?? "unknown framework"}, ${scan.packageManager})`,
  );

  // 2. Write scan result to .deco/project.json for reference
  try {
    const decoDir = join(projectDir, ".deco");
    await Bun.write(
      join(decoDir, "project.json"),
      JSON.stringify(scan, null, 2),
    );
  } catch {
    // Non-fatal — .deco dir might not exist yet
  }

  // 3. Filter applicable templates
  const applicable = PROJECT_AGENT_TEMPLATES.filter(
    (t) => !t.applicableWhen || t.applicableWhen(scan),
  );

  // 4. Check existing agents and create missing ones
  const database = getDb();
  const agentIds: string[] = [];

  // Get existing project agents for this org
  const existingAgents = await database.db
    .selectFrom("connections")
    .select(["id", "metadata"])
    .where("organization_id", "=", organizationId)
    .where("connection_type", "=", "VIRTUAL")
    .execute();

  const existingTypes = new Set<string>();
  for (const agent of existingAgents) {
    if (agent.metadata) {
      try {
        const meta =
          typeof agent.metadata === "string"
            ? JSON.parse(agent.metadata)
            : agent.metadata;
        if (meta.projectAgentType) {
          existingTypes.add(meta.projectAgentType);
          agentIds.push(agent.id);
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  // Import the storage class and ID generator
  const { VirtualMCPStorage } = await import("@/storage/virtual");
  const storage = new VirtualMCPStorage(database.db);

  for (const template of applicable) {
    if (existingTypes.has(template.id)) {
      console.log(`[project] Agent "${template.id}" already exists, skipping`);
      continue;
    }

    const title =
      typeof template.title === "function"
        ? template.title(scan)
        : template.title;

    const instructions = template.instructions(scan);

    const showPreview =
      template.id === "project-overview" ||
      template.id === "project-dev-server";

    const entity = await storage.create(organizationId, userId, {
      title,
      description: template.description,
      icon: template.icon,
      status: "active",
      pinned: true,
      metadata: {
        instructions,
        projectAgentType: template.id,
        ui: showPreview
          ? {
              layout: {
                defaultMainView: { type: "preview" },
                chatDefaultOpen: true,
              },
            }
          : null,
      },
      connections: [],
    });

    agentIds.push(entity.id);
    console.log(`[project] Created agent: ${title} (${entity.id})`);
  }

  console.log(
    `[project] Bootstrap complete: ${agentIds.length} agents for ${scan.projectName}`,
  );

  return { scan, agentIds };
}
