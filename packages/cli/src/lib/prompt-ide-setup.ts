/**
 * Prompts the user to make their IDE sentient about the project by installing MCP configurations.
 *
 * This function:
 * 1. Asks the user if they want to make their IDE sentient
 * 2. If yes, prompts them to select their IDE (Cursor, VSCode, or Windsurf)
 * 3. Returns the appropriate MCP configuration and target path for the selected IDE
 *
 * @param mcpConfig - The MCP configuration object
 * @param projectRoot - The root path of the project where the config should be written
 * @returns Promise<{ config: any; targetPath: string } | null> - The MCP config and target path, or null if user declines
 */
import inquirer from "inquirer";
import { promises as fs } from "fs";
import { dirname, join } from "path";
import { ensureDir } from "./fs.js";
import {
  getAppUUID,
  getMCPConfig,
  getMCPConfigVersion,
  getRulesConfig,
} from "./config.js";
import process from "node:process";

type MCPServerConfig =
  | {
      command: string;
      args: string[];
    }
  | {
      url: string;
      type: "http" | "sse";
      headers?: Record<string, string>;
    };

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

interface IDEConfig {
  content: string;
  path: string;
}

interface IDESupport {
  name: string;
  createConfig: (
    mcpConfig: MCPConfig,
    projectRoot: string,
  ) => Promise<IDEConfig[]>;
}

const IDE_SUPPORT: Record<string, IDESupport> = {
  cursor: {
    name: "Cursor",
    createConfig: async (mcpConfig: MCPConfig, projectRoot: string) => {
      const outDir = join(projectRoot, ".cursor");

      const configs = [];

      const configPath = join(outDir, "mcp.json");
      const existingConfig: MCPConfig = await fs
        .readFile(configPath, "utf-8")
        .then(JSON.parse)
        .catch(() => ({ mcpServers: {} }));

      const config = {
        mcpServers: {
          ...(existingConfig.mcpServers || {}),
          ...mcpConfig.mcpServers,
        },
      };

      configs.push({
        content: JSON.stringify(config, null, 2),
        path: join(outDir, "mcp.json"),
      });

      const rules = Object.entries(await getRulesConfig());

      for (const [path, content] of rules) {
        configs.push({ content, path: join(outDir, "rules", path) });
      }

      return configs;
    },
  },
  vscode: {
    name: "VS Code",
    createConfig: async (mcpConfig: MCPConfig, projectRoot: string) => {
      const outDir = join(projectRoot, ".vscode");

      const configs = [];

      const configPath = join(outDir, "mcp.json");
      const existingConfig: MCPConfig = await fs
        .readFile(configPath, "utf-8")
        .then(JSON.parse)
        .catch(() => ({ mcpServers: {} }));

      const config = {
        mcpServers: {
          ...(existingConfig.mcpServers || {}),
          ...mcpConfig.mcpServers,
        },
      };

      configs.push({
        content: JSON.stringify(config, null, 2),
        path: join(outDir, "mcp.json"),
      });

      const rules = Object.entries(await getRulesConfig());

      for (const [path, content] of rules) {
        configs.push({ content, path: join(outDir, "rules", path) });
      }

      return configs;
    },
  },
};

export async function writeIDEConfig(configs: IDEConfig[]): Promise<void> {
  const targetDir = dirname(configs[0]?.path ?? "");

  // Write all configuration files in parallel
  await Promise.all(
    configs.map(async ({ content, path }) => {
      await ensureDir(dirname(path));
      await fs.writeFile(path, content);
    }),
  );

  console.log(`✅ IDE configuration written to: ${targetDir}`);
}

const setMCPPreferences = async (workspace: string, app: string) => {
  const [appUUID, currentVersion] = await Promise.all([
    getAppUUID(workspace, app),
    getMCPConfigVersion(),
  ]);

  const prefsPath = join(process.cwd(), "deco", "preferences.json");

  try {
    await ensureDir(dirname(prefsPath));
    let prefs: Record<string, string> = {};

    try {
      prefs = JSON.parse(await fs.readFile(prefsPath, "utf-8")) as Record<
        string,
        string
      >;
    } catch {
      // File doesn't exist, start with empty prefs
    }

    prefs[`mcp-install-version-${appUUID}`] = currentVersion;
    await fs.writeFile(prefsPath, JSON.stringify(prefs, null, 2));
  } catch (error) {
    console.warn("Failed to save MCP preferences:", error);
  }
};

export async function promptIDESetup(
  cfg: { workspace: string; app: string },
  projectRoot: string = process.cwd(),
): Promise<Array<{ content: string; path: string }> | null> {
  await setMCPPreferences(cfg.workspace, cfg.app);

  const mcpConfig = getMCPConfig(cfg.workspace, cfg.app);

  // Ask if user wants to make IDE sentient
  const { wantsSentientIDE } = await inquirer.prompt([
    {
      type: "confirm",
      name: "wantsSentientIDE",
      message: "Would you like to configure your IDE to use this project?",
      default: true,
    },
  ]);

  if (!wantsSentientIDE) {
    return null;
  }

  // Prompt user to select their IDE
  const { selectedIDE } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedIDE",
      message: "Select your preferred IDE:",
      choices: [
        { name: "Cursor", value: "cursor" },
        { name: "VS Code", value: "vscode" },
        { name: "None", value: "none" },
      ],
    },
  ]);

  const ideSupport = IDE_SUPPORT[selectedIDE];

  if (selectedIDE === "none") {
    return null;
  }

  // Create the IDE-specific configuration
  const configs = await ideSupport.createConfig(mcpConfig, projectRoot);

  return configs;
}
