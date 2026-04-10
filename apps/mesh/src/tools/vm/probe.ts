import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireVmEntry } from "./helpers";

export const VM_PROBE = defineTool({
  name: "VM_PROBE",
  description: "Probe a VM URL via HEAD request (backend proxy for CORS).",
  annotations: {
    title: "Probe VM URL",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  _meta: { ui: { visibility: "app" } },
  inputSchema: z.object({
    virtualMcpId: z.string().describe("Virtual MCP ID"),
    url: z
      .string()
      .url()
      .describe("URL to probe (must match previewUrl or terminalUrl)"),
  }),
  outputSchema: z.object({
    status: z.number(),
    contentType: z.string().nullable(),
  }),

  handler: async (input, ctx) => {
    const { entry } = await requireVmEntry(input, ctx);
    if (!entry) {
      return { status: 0, contentType: null };
    }

    // Validate the URL is one of the VM's known URLs
    if (input.url !== entry.previewUrl && input.url !== entry.terminalUrl) {
      throw new Error("URL does not match any VM endpoint");
    }

    try {
      const res = await fetch(input.url, { method: "HEAD" });
      const contentType = res.headers.get("content-type");
      return { status: res.status, contentType };
    } catch {
      return { status: 0, contentType: null };
    }
  },
});
