/**
 * This file is responsible for reading and writing the config file.
 * Config for Deco workers is stored in the wrangler.toml file, so
 * we're a superset of the wrangler config.
 */
import { parse, stringify } from "smol-toml";
import { promises as fs, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { readSession } from "./session.js";
import { createHash } from "crypto";
import process from "node:process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// MD5 hash function using Node.js crypto
function md5Hash(input: string): string {
  const hash = createHash("sha1");
  hash.update(input);
  return hash.digest("hex");
}

const CONFIG_FILE = "wrangler.toml";

const requiredErrorForProp = (prop: string) =>
  `Property ${prop} is required. Please provide an inline value using --${prop} or configure it using 'deco configure'.`;

const DecoBindingSchema = z.union([
  z.object({
    name: z.string().min(1),
    type: z.string().min(1),
    integration_id: z.string().min(1),
  }),
  z.object({
    name: z.string().min(1),
    type: z.string().min(1),
    integration_name: z.string().min(1),
  }),
  z.object({
    name: z.string().min(1),
    type: z.literal("contract"),
    contract: z.object({
      body: z.string().min(1),
      clauses: z
        .array(
          z.object({
            id: z.string().min(1),
            price: z.union([z.string(), z.number()]),
            description: z.string().optional(),
          }),
        )
        .min(1),
    }),
  }),
]);

export type DecoBinding = z.infer<typeof DecoBindingSchema>;

const decoConfigSchema = z.object({
  workspace: z
    .union([
      z.string().min(1, requiredErrorForProp("workspace")),
      z.undefined(),
    ])
    .refine(
      (value): value is string => typeof value === "string" && value.length > 0,
      { message: requiredErrorForProp("workspace") },
    )
    .transform((value) => value as string),
  bindings: z.array(DecoBindingSchema).optional().default([]),
  local: z.boolean().optional().default(false),
  enable_workflows: z.boolean().optional().default(true),
});

let local: boolean;
export const setLocal = (l: boolean): void => {
  local = l;
};
export const getLocal = (): boolean => {
  return local;
};

export type Config = z.infer<typeof decoConfigSchema>;

export interface WranglerConfig {
  [key: string]: unknown;
  name?: string;
  scope?: string;
  assets?: {
    directory?: string;
  };
  migrations?: {
    tag: string;
    new_classes?: string[];
    new_sqlite_classes?: string[];
    deleted_classes?: string[];
  }[];
  durable_objects?: {
    bindings?: {
      name: string;
      class_name: string;
    }[];
  };
  deco?: Partial<Config>;
}

export const readWranglerConfig = async (cwd?: string) => {
  const configPath = getConfigFilePath(cwd || process.cwd());
  if (!configPath) {
    return {};
  }

  try {
    const config = await fs.readFile(configPath, "utf-8");
    return parse(config) as WranglerConfig;
  } catch {
    return {};
  }
};

/**
 * Read the config file from the current directory or any parent directory.
 * If no config file is found, returns an empty object, so we can still merge with inline options
 * and work without a config file.
 *
 * @param cwd - The current working directory to read config from.
 * @returns The partial config.
 */
const readConfigFile = async (cwd?: string) => {
  const wranglerConfig = await readWranglerConfig(cwd);
  const decoConfig = wranglerConfig.deco ?? ({} as Partial<Config>);
  return decoConfig;
};

const addSchemaNotation = (stringified: string) => {
  return `#:schema node_modules/@deco/workers-runtime/config-schema.json\n${stringified}`;
};

/**
 * Write the entire wrangler config to the config file.
 * @param config - The wrangler config to write.
 * @param cwd - The current working directory to write config to.
 * @param merge - Whether to merge with existing config or replace it.
 */
export const writeWranglerConfig = async (
  config: Partial<WranglerConfig>,
  cwd?: string,
) => {
  const targetCwd = cwd || process.cwd();
  const currentConfig = await readWranglerConfig(targetCwd);
  const mergedConfig = { ...currentConfig, ...config };
  mergedConfig.scope ??= mergedConfig.scope ?? mergedConfig?.deco?.workspace;
  const configPath =
    getConfigFilePath(targetCwd) ?? join(targetCwd, CONFIG_FILE);

  await fs.writeFile(configPath, addSchemaNotation(stringify(mergedConfig)));
  console.log(`✅ Wrangler configuration written to: ${configPath}`);
};

/**
 * Write the config to the current directory or any parent directory.
 * @param config - The config to write.
 * @param cwd - The current working directory to write config to.
 */
export const writeConfigFile = async (
  config: Partial<Config>,
  cwd?: string,
  merge = true,
) => {
  const targetCwd = cwd || process.cwd();
  const wranglerConfig = await readWranglerConfig(targetCwd);
  const current = wranglerConfig.deco ?? ({} as Partial<Config>);
  const mergedConfig = merge ? { ...current, ...config } : config;

  const configPath =
    getConfigFilePath(targetCwd) ?? join(targetCwd, CONFIG_FILE);

  await fs.writeFile(
    configPath,
    addSchemaNotation(
      stringify({
        ...wranglerConfig,
        deco: mergedConfig,
      }),
    ),
  );
  console.log(`✅ Deco configuration written to: ${configPath}`);
};

/**
 * Get the config for the current project considering the passed root directory and inline options.
 * @param rootDir - The root directory to read the config from.
 * @param inlineOptions - The inline options to merge with the config.
 * @param cwd - The current working directory to read config from.
 * @returns The config.
 */
export const getConfig = async ({
  inlineOptions = {},
  cwd,
}: {
  inlineOptions?: Partial<Config>;
  cwd?: string;
} = {}) => {
  const config = await readConfigFile(cwd);
  const merged = {
    ...config,
    ...Object.fromEntries(
      Object.entries(inlineOptions).filter(
        ([_key, value]) => value !== undefined,
      ),
    ),
  };

  if (!merged.workspace) {
    const session = await readSession();
    merged.workspace = session?.workspace;
  }
  merged.local = getLocal() ?? merged.local;
  return decoConfigSchema.parse(merged);
};

/**
 * Get the path to the config file in the current directory or any parent directory.
 * Useful for finding the config file when the current directory is not the root directory of the project.
 * @param cwd - The current working directory.
 * @returns The path to the config file or null if not found.
 */
export const getConfigFilePath = (cwd: string): string | null => {
  // First, try the direct path
  const directPath = join(cwd, CONFIG_FILE);

  try {
    const stat = statSync(directPath);
    if (stat.isFile()) {
      return directPath;
    }
  } catch {
    // File doesn't exist, continue searching
  }

  // If direct path fails, search parent directories
  const dirs = cwd.split(/[/\\]/); // Handle both Unix and Windows path separators
  const maxDepth = dirs.length;

  for (let i = maxDepth; i >= 1; i--) {
    const path = dirs.slice(0, i).join("/") || "/";
    const configPath = join(path, CONFIG_FILE);

    try {
      const stat = statSync(configPath);
      if (stat.isFile()) {
        return configPath;
      }
    } catch {
      // File doesn't exist, continue searching
    }
  }

  return null;
};

/**
 * Generate a unique app UUID based on workspace and app name.
 * Uses MD5 hash of workspace+app to ensure consistent UUIDs for the same project.
 * @param workspace - The workspace name
 * @param app - The app name
 * @returns A unique UUID string based on the workspace and app name.
 */
export const getAppUUID = (
  workspace: string = "default",
  app: string = "my-app",
): string => {
  try {
    const combined = `${workspace}-${app}`;
    const hash = md5Hash(combined);
    return hash.slice(0, 8); // Use first 8 characters for shorter, readable UUID
  } catch (error) {
    // Fallback to random UUID if hash generation fails
    console.warn(
      "Could not generate hash for UUID, using random fallback:",
      error,
    );
    return crypto.randomUUID().slice(0, 8);
  }
};

/**
 * Generate a domain for the app based on workspace and app name.
 * Uses the app UUID to create a consistent domain for the same project.
 * @param workspace - The workspace name
 * @param app - The app name
 * @returns A domain string for the app.
 */
export const getAppDomain = (workspace: string, app: string): string => {
  const appUUID = getAppUUID(workspace, app);
  return `localhost-${appUUID}.deco.host`;
};

export type MCPConfig = {
  mcpServers: {
    [key: string]: {
      type: "http";
      url: string;
    };
  };
};

export function getMCPConfig(workspace: string, app: string): MCPConfig {
  const appDomain = getAppDomain(workspace, app);

  return {
    mcpServers: {
      [app]: {
        type: "http" as const,
        url: `https://${appDomain}/mcp`,
      },
    },
  };
}

export const getMCPConfigVersion = () => md5Hash(getMCPConfig.toString());

export const getRulesConfig = async (): Promise<Record<string, string>> => {
  // TODO: Implement nice rules
  return {};
};
