import { promises as fs } from "fs";
import inquirer from "inquirer";
import process from "node:process";
import { createWorkspaceClientStub } from "../../lib/mcp.js";

interface MCPConnection {
  type: "HTTP" | "SSE" | "Websocket" | "Deco" | "INNATE";
  url?: string;
  token?: string;
  headers?: Record<string, string>;
  tenant?: string;
  name?: string;
  workspace?: string;
}

interface PublishAppConfig {
  scopeName: string;
  name: string;
  connection: MCPConnection;
  friendlyName?: string;
  description?: string;
  icon?: string;
  metadata?: Record<string, unknown>;
  unlisted?: boolean;
  tools?: Array<{
    name: string;
    description: string;
    inputSchema: unknown;
    outputSchema?: unknown;
  }>;
}

interface PublishOptions {
  file?: string;
  workspace: string;
  local: boolean;
  skipConfirmation?: boolean;
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";

    // Check if stdin is a TTY (interactive terminal)
    if (process.stdin.isTTY) {
      reject(
        new Error("No input provided. Use -f <file> or pipe JSON via stdin."),
      );
      return;
    }

    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      resolve(data);
    });
    process.stdin.on("error", (err) => {
      reject(err);
    });
  });
}

function validateConfig(config: unknown): config is PublishAppConfig {
  if (!config || typeof config !== "object") {
    return false;
  }

  const c = config as Record<string, unknown>;

  if (typeof c.scopeName !== "string" || !c.scopeName.trim()) {
    throw new Error("Missing or invalid 'scopeName' field");
  }

  if (typeof c.name !== "string" || !c.name.trim()) {
    throw new Error("Missing or invalid 'name' field");
  }

  if (!c.connection || typeof c.connection !== "object") {
    throw new Error("Missing or invalid 'connection' field");
  }

  const conn = c.connection as Record<string, unknown>;
  const validTypes = ["HTTP", "SSE", "Websocket", "Deco", "INNATE", "BINDING"];
  if (!validTypes.includes(conn.type as string)) {
    throw new Error(
      `Invalid connection type '${conn.type}'. Must be one of: ${validTypes.join(", ")}.`,
    );
  }

  return true;
}

export async function publishApp({
  file,
  workspace,
  local,
  skipConfirmation,
}: PublishOptions) {
  console.log(`\n📦 Publishing app to registry...\n`);

  // Read content from file or stdin
  let fileContent: string;
  const source = file ? `file "${file}"` : "stdin";

  if (file) {
    try {
      fileContent = await fs.readFile(file, "utf-8");
    } catch (error) {
      throw new Error(
        `Failed to read file "${file}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else {
    try {
      fileContent = await readStdin();
    } catch (error) {
      throw new Error(
        `Failed to read from stdin: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  let config: unknown;
  try {
    config = JSON.parse(fileContent);
  } catch (error) {
    throw new Error(
      `Failed to parse JSON from ${source}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Validate the config
  validateConfig(config);
  const appConfig = config as PublishAppConfig;

  // Display publish summary
  console.log("📋 Publish summary:");
  console.log(`  Scope: ${appConfig.scopeName}`);
  console.log(`  Name: ${appConfig.name}`);
  console.log(`  Full name: @${appConfig.scopeName}/${appConfig.name}`);
  console.log(`  Connection type: ${appConfig.connection.type}`);
  if (appConfig.friendlyName) {
    console.log(`  Friendly name: ${appConfig.friendlyName}`);
  }
  if (appConfig.description) {
    console.log(`  Description: ${appConfig.description}`);
  }
  if (appConfig.icon) {
    console.log(`  Icon: ${appConfig.icon}`);
  }
  console.log(`  Unlisted: ${appConfig.unlisted ?? true}`);
  console.log(`  Workspace: ${workspace}`);
  console.log();

  // Confirm with user
  const confirmed =
    skipConfirmation ||
    (
      await inquirer.prompt([
        {
          type: "confirm",
          name: "proceed",
          message: "Proceed with publishing?",
          default: true,
        },
      ])
    ).proceed;

  if (!confirmed) {
    console.log("❌ Publishing cancelled");
    process.exit(0);
  }

  // Create MCP client and call the publish tool
  const client = await createWorkspaceClientStub({ workspace, local });

  const response = await client.callTool({
    name: "REGISTRY_PUBLISH_APP",
    arguments: {
      scopeName: appConfig.scopeName,
      name: appConfig.name,
      connection: appConfig.connection,
      friendlyName: appConfig.friendlyName,
      description: appConfig.description,
      icon: appConfig.icon,
      metadata: appConfig.metadata,
      unlisted: appConfig.unlisted,
      tools: appConfig.tools,
    },
  });

  if (response.isError && Array.isArray(response.content)) {
    const errorText = response.content[0]?.text ?? "Unknown error";
    throw new Error(`Failed to publish app: ${errorText}`);
  }

  const result = response.structuredContent as {
    appName?: string;
    name?: string;
    scopeName?: string;
  };

  console.log(`\n🎉 Successfully published!`);
  console.log(`  App: @${appConfig.scopeName}/${appConfig.name}`);
  if (result?.appName) {
    console.log(`  Registry name: ${result.appName}`);
  }
  console.log();
}
