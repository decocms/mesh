/**
 * Mesh Login Command
 *
 * Authenticates with the Mesh using Better Auth.
 * Supports email/password login or browser-based OAuth.
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { spawn } from "child_process";
import { randomBytes } from "crypto";
import * as readline from "readline";
import process from "node:process";
import { saveMeshSession, type MeshSession } from "../../lib/mesh-session.js";

const AUTH_PORT = 3458; // Different port from old auth

interface MeshLoginOptions {
  meshUrl?: string;
  email?: string;
  password?: string;
}

/**
 * Open browser with OS-appropriate command
 */
function openBrowser(url: string): void {
  const browserCommands: Record<string, string> = {
    linux: "xdg-open",
    darwin: "open",
    win32: "start",
  };

  const browser =
    process.env.BROWSER ?? browserCommands[process.platform] ?? "open";

  const command =
    process.platform === "win32" && browser === "start"
      ? spawn("cmd", ["/c", "start", url], { detached: true })
      : spawn(browser, [url], { detached: true });

  command.unref();
  command.on("error", () => {
    console.log("⚠️  Could not automatically open browser");
  });
}

/**
 * Prompt for email and password
 */
async function promptCredentials(): Promise<{
  email: string;
  password: string;
}> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("📧 Email: ", (email) => {
      // Hide password input
      process.stdout.write("🔑 Password: ");
      let password = "";

      const stdin = process.stdin;
      const originalRawMode = stdin.isRaw;

      if (stdin.isTTY) {
        stdin.setRawMode(true);
      }
      stdin.resume();
      stdin.setEncoding("utf8");

      const onData = (char: string) => {
        if (char === "\n" || char === "\r") {
          stdin.removeListener("data", onData);
          if (stdin.isTTY) {
            stdin.setRawMode(originalRawMode ?? false);
          }
          console.log(""); // New line after password
          rl.close();
          resolve({ email: email.trim(), password });
        } else if (char === "\u0003") {
          // Ctrl+C
          process.exit(0);
        } else if (char === "\u007F" || char === "\b") {
          // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
          }
        } else {
          password += char;
        }
      };

      stdin.on("data", onData);
    });
  });
}

/**
 * Login with email and password directly
 */
async function loginWithEmailPassword(
  meshUrl: string,
  email: string,
  password: string,
): Promise<MeshSession> {
  const response = await fetch(`${meshUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Login failed: ${error}`);
  }

  const data = await response.json();

  // Better Auth returns user and session in the response
  if (!data.user || !data.token) {
    throw new Error("Invalid response from auth server");
  }

  return {
    meshUrl,
    token: data.token,
    user: {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
    },
    expiresAt: data.expiresAt,
  };
}

/**
 * Login with browser-based OAuth flow
 * Uses Better Auth's session token via callback
 */
async function loginWithBrowser(meshUrl: string): Promise<MeshSession> {
  return new Promise((resolve, reject) => {
    const state = randomBytes(16).toString("hex");
    let timeout: NodeJS.Timeout;

    const server = createServer(
      async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url!, `http://localhost:${AUTH_PORT}`);

        if (url.pathname === "/callback") {
          const token = url.searchParams.get("token");
          const error = url.searchParams.get("error");
          const receivedState = url.searchParams.get("state");
          const userBase64 = url.searchParams.get("user");
          const expiresAt = url.searchParams.get("expiresAt");

          if (error) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(
              `<html><body><h1>Login Failed</h1><p>${error}</p></body></html>`,
            );
            clearTimeout(timeout);
            server.close(() => reject(new Error(error)));
            return;
          }

          if (receivedState !== state) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(`<html><body><h1>Invalid State</h1></body></html>`);
            return;
          }

          if (!token) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(`<html><body><h1>No Token Received</h1></body></html>`);
            return;
          }

          // Parse user data from callback (already included by cli-callback page)
          try {
            let userData: {
              user?: { id?: string; email?: string; name?: string };
            } = {};

            if (userBase64) {
              try {
                userData = {
                  user: JSON.parse(
                    Buffer.from(userBase64, "base64").toString("utf-8"),
                  ),
                };
              } catch {
                // Fallback to empty user
                userData = { user: {} };
              }
            }

            res.writeHead(200, {
              "Content-Type": "text/html; charset=utf-8",
            });
            res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Login Successful - MCP Mesh</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      background: #0a0a0a;
      color: #fafafa;
      overflow-x: hidden;
    }
    
    .layout {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    
    /* Animation panel */
    .animation-panel {
      flex: 1;
      min-height: 40vh;
      position: relative;
      overflow: hidden;
    }
    
    .animation-container {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    
    /* Content panel */
    .content-panel {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 3rem 2rem;
      background: #111111;
      border-top: 1px solid #262626;
    }
    
    .card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 1.5rem;
      padding: 3rem;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    
    .logo {
      width: 140px;
      height: auto;
      margin-bottom: 2rem;
      opacity: 0;
      animation: fadeSlideUp 0.6s ease-out 0.2s forwards;
    }
    
    .success-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(34, 197, 94, 0.12);
      border: 1px solid rgba(34, 197, 94, 0.25);
      color: #4ade80;
      padding: 0.5rem 1rem;
      border-radius: 9999px;
      font-size: 0.8125rem;
      font-weight: 500;
      margin-bottom: 1.5rem;
      opacity: 0;
      animation: fadeSlideUp 0.6s ease-out 0.4s forwards;
    }
    
    .success-badge svg {
      width: 14px;
      height: 14px;
    }
    
    h1 {
      font-size: 1.75rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
      letter-spacing: -0.025em;
      text-align: center;
      opacity: 0;
      animation: fadeSlideUp 0.6s ease-out 0.6s forwards;
    }
    
    p {
      color: #71717a;
      font-size: 0.875rem;
      line-height: 1.5;
      text-align: center;
      opacity: 0;
      animation: fadeSlideUp 0.6s ease-out 0.8s forwards;
    }
    
    @keyframes fadeSlideUp {
      from {
        opacity: 0;
        transform: translateY(16px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    /* Desktop: side by side */
    @media (min-width: 768px) {
      .layout {
        flex-direction: row;
      }
      
      .animation-panel {
        flex: 1;
        min-height: 100vh;
      }
      
      .content-panel {
        flex: 0 0 480px;
        border-top: none;
        border-left: 1px solid #262626;
        padding: 2rem;
      }
      
      .card {
        padding: 3.5rem;
      }
      
      h1 {
        font-size: 2rem;
      }
    }
    
    /* Large desktop */
    @media (min-width: 1200px) {
      .content-panel {
        flex: 0 0 540px;
      }
    }
  </style>
</head>
<body>
  <div class="layout">
    <!-- Capybara Animation Panel -->
    <div class="animation-panel">
      <div class="animation-container">
        <div
          data-us-project="3u9H2SGWSifD8DQZHG4X"
          data-us-production="true"
          style="width: 100%; height: 100%;"
        ></div>
      </div>
    </div>
    
    <!-- Content Card Panel -->
    <div class="content-panel">
      <div class="card">
        <img 
          src="https://assets.decocache.com/decocms/4869c863-d677-4e5b-b3fd-4b3913a56034/deco-logo.png" 
          alt="MCP Mesh" 
          class="logo"
        />
        <div class="success-badge">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
          Authenticated
        </div>
        <h1>Welcome to the Mesh</h1>
        <p>You can close this window and return to the terminal.</p>
      </div>
    </div>
  </div>
  
  <script src="https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v2.0.0/dist/unicornStudio.umd.js"></script>
  <script>
    if (window.UnicornStudio) {
      window.UnicornStudio.init().catch(console.error);
    }
  </script>
</body>
</html>`);

            clearTimeout(timeout);
            server.close(() =>
              resolve({
                meshUrl,
                token,
                user: {
                  id: userData.user?.id || "unknown",
                  email: userData.user?.email,
                  name: userData.user?.name,
                },
                expiresAt: expiresAt || undefined,
              }),
            );
          } catch (err) {
            res.writeHead(500, { "Content-Type": "text/html" });
            res.end(`<html><body><h1>Error</h1><p>${err}</p></body></html>`);
            clearTimeout(timeout);
            server.close(() => reject(err));
          }
          return;
        }

        res.writeHead(404);
        res.end("Not found");
      },
    );

    server.listen(AUTH_PORT, () => {
      const callbackUrl = `http://localhost:${AUTH_PORT}/callback?state=${state}`;
      const loginUrl = `${meshUrl}/login?cli=true&callback=${encodeURIComponent(callbackUrl)}`;

      console.log("🔐 Opening browser for login...\n");
      console.log(`   Login URL: ${loginUrl}\n`);
      console.log(
        `   Callback listening on: http://localhost:${AUTH_PORT}/callback\n`,
      );
      openBrowser(loginUrl);

      timeout = setTimeout(() => {
        console.log("📋 If your browser didn't open, visit:");
        console.log(`\n   ${loginUrl}\n`);
        console.log("Waiting for authentication...\n");
      }, 1000);
    });

    server.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Main Mesh login command
 */
export async function meshLoginCommand(
  options: MeshLoginOptions = {},
): Promise<void> {
  const meshUrl =
    options.meshUrl || process.env.MESH_URL || "http://localhost:3000";

  console.log(`\n🔗 Connecting to Mesh at ${meshUrl}\n`);

  try {
    let session: MeshSession;

    if (options.email && options.password) {
      // Direct email/password login
      console.log("🔑 Logging in with email/password...");
      session = await loginWithEmailPassword(
        meshUrl,
        options.email,
        options.password,
      );
    } else if (process.stdin.isTTY) {
      // Interactive: ask user how they want to login
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const method = await new Promise<string>((resolve) => {
        rl.question(
          "Login method: (1) Email/Password, (2) Browser [2]: ",
          (answer) => {
            rl.close();
            resolve(answer.trim() || "2");
          },
        );
      });

      if (method === "1") {
        const { email, password } = await promptCredentials();
        session = await loginWithEmailPassword(meshUrl, email, password);
      } else {
        session = await loginWithBrowser(meshUrl);
      }
    } else {
      // Non-interactive: use browser
      session = await loginWithBrowser(meshUrl);
    }

    // Save session
    await saveMeshSession(session);

    console.log(`\n✅ Successfully logged in to Mesh!`);
    console.log(
      `   User: ${session.user.email || session.user.name || session.user.id}`,
    );
    console.log(`   Mesh: ${meshUrl}\n`);
  } catch (error) {
    throw new Error(
      `Login failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
