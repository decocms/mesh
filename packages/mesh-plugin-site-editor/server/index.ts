import type { ServerPlugin } from "@decocms/bindings/server-plugin";
import { PLUGIN_ID, PLUGIN_DESCRIPTION } from "../shared";

export const serverPlugin: ServerPlugin = {
  id: PLUGIN_ID,
  description: PLUGIN_DESCRIPTION,
  routes: (app, _ctx) => {
    /**
     * POST /api/plugins/site-editor/commit-message
     * Body: { diff: string }
     * Returns: { message: string }
     *
     * Calls Claude Haiku to generate a conventional commit message from a git diff.
     * Falls back to empty string if ANTHROPIC_API_KEY is not set.
     */
    app.post("/commit-message", async (c) => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return c.json({ message: "" });
      }

      let diff = "";
      try {
        const body = (await c.req.json()) as { diff?: string };
        diff = body.diff ?? "";
      } catch {
        return c.json({ message: "" });
      }

      if (!diff.trim()) {
        return c.json({ message: "Update site page" });
      }

      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 200,
            messages: [
              {
                role: "user",
                content: `Generate a conventional commit message (50 chars max subject line) for this git diff. Output ONLY the commit message, nothing else.\n\nDiff:\n${diff.slice(0, 3000)}`,
              },
            ],
          }),
        });

        const data = (await response.json()) as {
          content?: Array<{ type: string; text: string }>;
        };
        const message = data.content?.[0]?.text?.trim() ?? "";
        return c.json({ message });
      } catch {
        return c.json({ message: "" });
      }
    });
  },
};
