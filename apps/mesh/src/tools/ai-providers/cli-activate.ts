import z from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";
import { query } from "@anthropic-ai/claude-agent-sdk";

async function activateClaudeCode(): Promise<{
  activated: boolean;
  email?: string;
  error?: string;
}> {
  try {
    const q = query({ prompt: "", options: { maxTurns: 1 } });
    const info = await q.accountInfo();
    q.return(undefined);

    if (!info.email) {
      return {
        activated: false,
        error: "Claude Code is not authenticated. Run: claude auth login",
      };
    }
    return { activated: true, email: info.email };
  } catch {
    return {
      activated: false,
      error:
        "Claude Code is not available. Install from https://docs.anthropic.com/en/docs/claude-code/overview",
    };
  }
}

async function activateCodex(): Promise<{
  activated: boolean;
  email?: string;
  error?: string;
}> {
  try {
    const proc = Bun.spawn(["codex", "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeout = setTimeout(() => proc.kill(), 10_000);
    const exitCode = await proc.exited;
    clearTimeout(timeout);

    if (exitCode !== 0) {
      return {
        activated: false,
        error:
          "Codex CLI is not available. Install with: npm install -g @openai/codex",
      };
    }
  } catch {
    return {
      activated: false,
      error:
        "Codex CLI is not available. Install with: npm install -g @openai/codex",
    };
  }

  return { activated: true };
}

export const AI_PROVIDER_CLI_ACTIVATE = defineTool({
  name: "AI_PROVIDER_CLI_ACTIVATE",
  description:
    "Check if a CLI-based AI provider (Claude Code or Codex) is installed and authenticated, then activate it.",
  inputSchema: z.object({
    providerId: z
      .enum(["claude-code", "codex"])
      .default("claude-code")
      .describe("Which CLI provider to activate"),
  }),
  outputSchema: z.object({
    activated: z.boolean(),
    email: z.string().optional(),
    error: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    requireAuth(ctx);
    const org = requireOrganization(ctx);
    await ctx.access.check();

    const result =
      input.providerId === "codex"
        ? await activateCodex()
        : await activateClaudeCode();

    if (!result.activated) {
      return result;
    }

    await ctx.storage.aiProviderKeys.upsert({
      providerId: input.providerId,
      label: input.providerId === "codex" ? "Codex CLI" : "Claude CLI",
      apiKey: "cli-local",
      organizationId: org.id,
      createdBy: ctx.auth.user!.id,
    });

    return result;
  },
});
