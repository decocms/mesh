/**
 * Preview Setup — Empty State
 *
 * Auto-detects the dev command/port from package.json, lock files,
 * script content, and framework config files. Auto-saves when confident.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Label } from "@deco/ui/components/label.tsx";
import { Loading01, Monitor01, Stars01 } from "@untitledui/icons";
import { useChatBridge } from "@decocms/mesh-sdk";
import {
  useWritePreviewConfig,
  type PreviewConfig,
} from "../hooks/use-preview-config";
import { KEYS } from "../lib/query-keys";

interface PreviewSetupProps {
  client: Client;
  connectionId: string;
  onConfigSaved: (config: PreviewConfig) => void;
}

/** Well-known framework ports */
const FRAMEWORK_PORTS: Record<string, number> = {
  next: 3000,
  vite: 5173,
  "@vitejs/plugin-react": 5173,
  "@vitejs/plugin-vue": 5173,
  nuxt: 3000,
  gatsby: 8000,
  remix: 5173,
  "@remix-run/dev": 5173,
  astro: 4321,
  "react-scripts": 3000,
  "@sveltejs/kit": 5173,
  "@angular/cli": 4200,
};

/** Dev script names to look for, in priority order */
const DEV_SCRIPTS = ["dev", "start:dev", "serve", "start"];

/** Framework config files that may contain port settings */
const CONFIG_FILES = [
  "vite.config.ts",
  "vite.config.js",
  "nuxt.config.ts",
  "astro.config.mjs",
];

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

type McpReadResult = { content?: Array<{ type?: string; text?: string }> };

/** Read a file via MCP, returning its text or null. */
async function readFile(client: Client, path: string): Promise<string | null> {
  try {
    const result = (await client.callTool({
      name: "read_file",
      arguments: { path },
    })) as McpReadResult;
    return result.content?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

/** Detect package manager from lock files */
async function detectPackageManager(
  client: Client,
): Promise<"bun" | "pnpm" | "yarn" | "npm"> {
  // Read lock files in parallel — existence check via read_file
  const [bunLock, pnpmLock, yarnLock] = await Promise.all([
    readFile(client, "bun.lockb"),
    readFile(client, "pnpm-lock.yaml"),
    readFile(client, "yarn.lock"),
  ]);

  if (bunLock !== null) return "bun";
  if (pnpmLock !== null) return "pnpm";
  if (yarnLock !== null) return "yarn";
  return "npm";
}

/** Build the run command prefix for a package manager */
function runPrefix(pm: "bun" | "pnpm" | "yarn" | "npm"): string {
  if (pm === "yarn") return "yarn";
  return `${pm} run`;
}

/** Try to extract a port number from a script value string */
function portFromScript(scriptValue: string): number | null {
  const portFlag = scriptValue.match(/--port[= ]\s*(\d+)/);
  if (portFlag?.[1]) return parseInt(portFlag[1], 10);

  const shortFlag = scriptValue.match(/-p\s+(\d+)/);
  if (shortFlag?.[1]) return parseInt(shortFlag[1], 10);

  return null;
}

/** Try to extract a port from a framework config file's text content */
function portFromConfig(content: string): number | null {
  const match = content.match(/port:\s*(\d+)/);
  return match?.[1] ? parseInt(match[1], 10) : null;
}

interface DetectionResult {
  command: string;
  port: number;
  confidence: "high" | "low";
}

/**
 * Full heuristic-based dev server detection.
 *
 * Reads lock files, package.json, and framework config files in parallel
 * to determine the best command and port.
 */
async function detectDevServer(client: Client): Promise<DetectionResult> {
  // Phase 1: Read package.json + detect package manager in parallel
  const [pkgText, pm] = await Promise.all([
    readFile(client, "package.json"),
    detectPackageManager(client),
  ]);

  if (!pkgText) {
    return { command: `${runPrefix(pm)} dev`, port: 3000, confidence: "low" };
  }

  let pkg: PackageJson;
  try {
    pkg = JSON.parse(pkgText) as PackageJson;
  } catch {
    return { command: `${runPrefix(pm)} dev`, port: 3000, confidence: "low" };
  }

  const scripts = pkg.scripts ?? {};
  const allDeps = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  };
  const prefix = runPrefix(pm);

  // Detect command from scripts
  let scriptName: string | null = null;
  let scriptValue: string | null = null;
  for (const name of DEV_SCRIPTS) {
    if (scripts[name]) {
      scriptName = name;
      scriptValue = scripts[name];
      break;
    }
  }

  const command = scriptName ? `${prefix} ${scriptName}` : `${prefix} dev`;
  const commandExplicit = scriptName !== null;

  // Phase 2: Detect port — check script content first
  let port: number | null = null;
  let portExplicit = false;

  if (scriptValue) {
    port = portFromScript(scriptValue);
    if (port !== null) portExplicit = true;
  }

  // Phase 2b: Check framework config files in parallel
  if (port === null) {
    const configContents = await Promise.all(
      CONFIG_FILES.map((f) => readFile(client, f)),
    );

    for (const content of configContents) {
      if (content !== null) {
        const configPort = portFromConfig(content);
        if (configPort !== null) {
          port = configPort;
          portExplicit = true;
          break;
        }
      }
    }
  }

  // Phase 2c: Fall back to framework defaults from dependencies
  if (port === null) {
    for (const [dep, defaultPort] of Object.entries(FRAMEWORK_PORTS)) {
      if (dep in allDeps) {
        port = defaultPort;
        break;
      }
    }
  }

  // Phase 2d: Ultimate fallback
  if (port === null) port = 3000;

  const confidence = commandExplicit && portExplicit ? "high" : "low";

  return { command, port, confidence };
}

export default function PreviewSetup({
  client,
  connectionId,
  onConfigSaved,
}: PreviewSetupProps) {
  const [command, setCommand] = useState("");
  const [port, setPort] = useState("");
  const [autoSaving, setAutoSaving] = useState(false);

  const writeConfig = useWritePreviewConfig(client, connectionId);
  const chatBridge = useChatBridge();

  const handleAskAI = () => {
    if (!chatBridge) return;
    chatBridge.sendMessage(
      "Analyze this project and configure the dev server preview. " +
        "Check package.json, config files (vite.config.ts, next.config.js, etc.), " +
        "and lock files to determine the correct dev command and port. " +
        "Then write the config to .deco/preview.json.",
    );
  };

  // Auto-detect dev server configuration
  const { isLoading: isDetecting } = useQuery({
    queryKey: KEYS.detect(connectionId),
    queryFn: async () => {
      const detected = await detectDevServer(client);

      if (detected.confidence === "high") {
        // Auto-save and skip the form
        const config: PreviewConfig = {
          command: detected.command,
          port: detected.port,
        };
        setAutoSaving(true);
        writeConfig.mutate(config, {
          onSuccess: () => onConfigSaved(config),
          onError: () => {
            // Fall back to showing the form
            setAutoSaving(false);
            setCommand(detected.command);
            setPort(String(detected.port));
          },
        });
      } else {
        setCommand((prev) => prev || detected.command);
        setPort((prev) => prev || String(detected.port));
      }

      return detected;
    },
    enabled: !!client,
    staleTime: Infinity,
  });

  const handleSave = () => {
    const portNum = parseInt(port, 10);
    if (!command.trim() || Number.isNaN(portNum) || portNum < 1) return;

    const config: PreviewConfig = { command: command.trim(), port: portNum };
    writeConfig.mutate(config, {
      onSuccess: () => onConfigSaved(config),
    });
  };

  if (isDetecting || autoSaving) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="flex flex-col items-center gap-6 max-w-sm w-full">
          <Monitor01 size={48} className="text-muted-foreground" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loading01 size={16} className="animate-spin" />
            {autoSaving ? "Saving configuration..." : "Detecting dev server..."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <div className="flex flex-col items-center gap-6 max-w-sm w-full">
        <Monitor01 size={48} className="text-muted-foreground" />
        <div className="text-center">
          <h2 className="text-lg font-semibold mb-1">Set Up Dev Preview</h2>
          <p className="text-sm text-muted-foreground">
            Configure the dev server command and port to preview your app.
          </p>
        </div>

        <div className="flex flex-col gap-4 w-full">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="preview-command">Command</Label>
            <Input
              id="preview-command"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="npm run dev"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="preview-port">Port</Label>
            <Input
              id="preview-port"
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="3000"
              min={1}
              max={65535}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Button
              onClick={handleSave}
              disabled={
                writeConfig.isPending ||
                !command.trim() ||
                !port ||
                Number.isNaN(parseInt(port, 10))
              }
            >
              {writeConfig.isPending ? (
                <>
                  <Loading01 size={14} className="mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save & Start"
              )}
            </Button>
            {chatBridge && (
              <Button variant="outline" onClick={handleAskAI}>
                <Stars01 size={14} className="mr-1" />
                Ask AI to detect
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
