import { ChildProcess, spawn } from "child_process";
import { connect } from "@deco-cx/warp-node";
import chalk from "chalk";
import {
  getAppDomain,
  getConfig,
  readWranglerConfig,
} from "../../lib/config.js";
import { createServer } from "net";
import process from "node:process";

interface LinkOptions {
  port?: number;
  onBeforeRegister?: (server: string) => void | ChildProcess;
}

function copyToClipboard(text: string): Promise<boolean> {
  try {
    let command: string;
    let args: string[] = [];

    switch (process.platform) {
      case "darwin":
        command = "pbcopy";
        break;
      case "win32":
        command = "clip";
        break;
      case "linux":
        command = "xclip";
        args = ["-selection", "clipboard"];
        break;
      default:
        return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      const clipProcess = spawn(command, args, { stdio: "pipe" });

      clipProcess.stdin.write(text);
      clipProcess.stdin.end();

      clipProcess.on("close", (code) => {
        resolve(code === 0);
      });

      clipProcess.on("error", () => {
        resolve(false);
      });
    });
  } catch {
    return Promise.resolve(false);
  }
}

async function findRunningAddr(port: number): Promise<string | null> {
  const LOCALHOST_ENDPOINTS = ["localhost", "127.0.0.1", "0.0.0.0"];

  for (const endpoint of LOCALHOST_ENDPOINTS) {
    try {
      const server = createServer();

      await new Promise<void>((resolve, reject) => {
        server.listen(port, endpoint, () => {
          server.close();
          resolve();
        });

        server.on("error", reject);
      });

      // Port is available on this endpoint, continue checking others
    } catch {
      // Port is in use on this endpoint
      return endpoint;
    }
  }

  // Port is available on all endpoints
  return null;
}

async function waitForPort(port: number): Promise<string> {
  let addr = await findRunningAddr(port);
  if (addr) {
    return addr;
  }

  console.log(chalk.yellow(`Waiting for port ${port} to become available...`));

  while (!addr) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    addr = await findRunningAddr(port);
  }

  console.log(chalk.green(`Port ${port} is now available!`));
  return addr;
}

async function monitorPortAvailability(port: number) {
  while (true) {
    const isAvailable = await findRunningAddr(port);
    if (!isAvailable) {
      console.log(chalk.red(`⚠️ Warning: Port ${port} is no longer available!`));
    }
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Check every 2 seconds
  }
}

async function register(
  port: number,
  domain: string,
  onBeforeRegister?: (server: string) => void,
) {
  const server = `wss://${domain}`;
  const serverUrl = `https://${domain}`;

  try {
    // Start port monitoring in the background
    monitorPortAvailability(port).catch((err) => {
      console.error("Port monitoring error:", err);
    });

    onBeforeRegister?.(serverUrl);

    // Wait for port to become available before connecting
    const host = await waitForPort(port);
    const localAddr = `http://${host}:${port}`;

    const tunnel = await connect({
      domain,
      localAddr,
      server,
      apiKey:
        process.env.DECO_TUNNEL_SERVER_TOKEN ??
        "c309424a-2dc4-46fe-bfc7-a7c10df59477",
    });

    await tunnel.registered;
    const copied = await copyToClipboard(serverUrl);

    console.log(
      `\nTunnel started \n   -> 🌐 ${chalk.bold("Preview")}: ${chalk.cyan(
        serverUrl,
      )}${copied ? chalk.dim(" (copied to clipboard)") : ""}`,
    );

    await tunnel.closed;
  } catch (err) {
    console.log("Tunnel connection error, retrying in 500ms...", err);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return register(port, domain);
  }
}

export const link = async ({
  port = 8787,
  onBeforeRegister,
}: LinkOptions = {}) => {
  // Get config to extract workspace and app
  const config = await getConfig({});
  const wranglerConfig = await readWranglerConfig();
  const app =
    typeof wranglerConfig.name === "string" ? wranglerConfig.name : "my-app";

  // Generate app domain based on workspace and app name
  const appDomain = getAppDomain(config.workspace, app);

  await register(port, appDomain, onBeforeRegister);
};
