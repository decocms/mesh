import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import {
  getUserId,
  requireAuth,
  requireOrganization,
} from "../../core/mesh-context";
import { createFreestyleClient } from "../../freestyle/client";
import { runScript } from "../../freestyle/runtime";

const InputSchema = z.object({
  virtual_mcp_id: z.string().describe("ID of the virtual MCP"),
  script: z.string().describe("Script name from package.json to run"),
});

const OutputSchema = z.object({
  success: z.boolean(),
  vm_domain: z.string().nullable(),
});

export const VIRTUAL_MCP_RUN_SCRIPT = defineTool({
  name: "VIRTUAL_MCP_RUN_SCRIPT",
  description: "Start a script from the linked repository on a Freestyle VM.",
  annotations: {
    title: "Run Script",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,

  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);
    await ctx.access.check();

    const userId = getUserId(ctx);
    if (!userId) {
      throw new Error("User ID required");
    }

    if (!ctx.freestyleApiKey) {
      throw new Error("FREESTYLE_API_KEY is not configured.");
    }

    const existing = await ctx.storage.virtualMcps.findById(
      input.virtual_mcp_id,
    );
    if (!existing || existing.organization_id !== organization.id) {
      throw new Error(`Virtual MCP not found: ${input.virtual_mcp_id}`);
    }

    const metadata = existing.metadata as Record<string, unknown>;

    // Allow running if idle, or if stale "running" state with no VM domain
    const isStaleRunning =
      metadata.runtime_status === "running" && !metadata.vm_domain;
    if (
      metadata.runtime_status !== "idle" &&
      metadata.runtime_status !== null &&
      metadata.runtime_status !== undefined &&
      !isStaleRunning
    ) {
      throw new Error(
        `Cannot start script: current status is "${metadata.runtime_status}". Stop the running script first.`,
      );
    }

    // Set installing status while VM is being created
    await ctx.storage.virtualMcps.update(input.virtual_mcp_id, userId, {
      metadata: {
        ...existing.metadata,
        runtime_status: "installing",
        running_script: input.script,
      },
    });

    const freestyle = createFreestyleClient(ctx.freestyleApiKey);

    // Run in background — don't block the tool response on VM creation
    // This prevents MCP timeout errors when Freestyle takes long (cache miss)
    const virtualMcpId = input.virtual_mcp_id;
    const script = input.script;

    (async () => {
      try {
        const result = await runScript(freestyle, metadata, script);

        await ctx.storage.virtualMcps.update(virtualMcpId, userId, {
          metadata: {
            ...existing.metadata,
            runtime_status: result.appReady ? "running" : "installing",
            running_script: script,
            freestyle_vm_id: result.vmId,
            vm_domain: result.domain,
            terminal_domain: result.terminalDomain,
          },
        });
        console.log(
          "[run-script] VM ready:",
          result.domain,
          "appReady:",
          result.appReady,
        );
      } catch (error) {
        console.error("[run-script] VM creation failed:", error);
        // Reset on failure
        await ctx.storage.virtualMcps
          .update(virtualMcpId, userId, {
            metadata: {
              ...existing.metadata,
              runtime_status: "idle",
              running_script: null,
              vm_domain: null,
              terminal_domain: null,
            },
          })
          .catch(() => {});
      }
    })();

    return {
      success: true,
      vm_domain: null,
    };
  },
});
