import type { OBJECT_STORAGE_BINDING, PluginContext } from "@decocms/bindings";
import type { SiteResearchReport } from "./types";
import { readFile, fileExists } from "./storage";
import { RESEARCH_STEPS } from "./steps";

type ToolCaller = PluginContext<typeof OBJECT_STORAGE_BINDING>["toolCaller"];

const REPORT_SYSTEM_PROMPT = `You are a website analyst. Given partial analysis results from multiple tools, synthesize a unified site research report.

Output valid JSON with this structure:
{
  "overallScore": number (0-100),
  "sections": ReportSection[],
  "agentSuggestions": AgentSuggestion[]
}

Where ReportSection is one of:
- { "type": "markdown", "content": string }
- { "type": "metrics", "title": string, "items": [{ "label": string, "value": string|number, "unit"?: string, "status"?: "passing"|"warning"|"failing"|"info" }] }
- { "type": "criteria", "title": string, "items": [{ "label": string, "description"?: string, "status"?: "passing"|"warning"|"failing"|"info" }] }

And AgentSuggestion is:
{ "afterSectionIndex": number, "agentId": string, "agentName": string, "reason": string, "priority": "high"|"medium"|"low" }

Create these sections:
1. Executive Summary (markdown)
2. SEO Health (criteria)
3. Brand Overview (markdown)
4. Recommendations (markdown)

Include 1-2 agent suggestions. Be concise. Use real data from the analysis results. Output ONLY valid JSON, no markdown fences.`;

/**
 * Synthesize a final report from all completed step outputs.
 */
export async function synthesizeReport(
  toolCaller: ToolCaller,
  sessionId: string,
  url: string,
): Promise<SiteResearchReport> {
  const outputs: Record<string, unknown> = {};
  for (const step of RESEARCH_STEPS) {
    const exists = await fileExists(toolCaller, sessionId, step.outputFile);
    if (exists) {
      outputs[step.id] = await readFile(toolCaller, sessionId, step.outputFile);
    }
  }

  const result = await (
    toolCaller as (name: string, args: unknown) => Promise<unknown>
  )("LLM_DO_GENERATE", {
    modelId: "openai/gpt-4o-mini",
    callOptions: {
      prompt: [
        { role: "system", content: REPORT_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: JSON.stringify({ url, analysisResults: outputs }),
            },
          ],
        },
      ],
    },
  });

  // Parse LLM response — output shape is { content: [{ type: "text", text: "..." }] }
  const raw = result as Record<string, unknown>;

  // Extract text from the AI SDK content array
  let text = "";
  if (Array.isArray(raw.content)) {
    const textPart = raw.content.find(
      (p: Record<string, unknown>) => p.type === "text",
    ) as { text: string } | undefined;
    text = textPart?.text ?? "";
  } else if (typeof raw.text === "string") {
    text = raw.text;
  } else if (typeof raw === "string") {
    text = raw;
  }

  // Strip markdown fences if present
  const cleaned = text
    .replace(/^```json?\s*\n?/i, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  const parsed = cleaned ? JSON.parse(cleaned) : {};

  return {
    url,
    analyzedAt: new Date().toISOString(),
    overallScore: (parsed.overallScore as number) ?? 0,
    sections: (parsed.sections as SiteResearchReport["sections"]) ?? [],
    agentSuggestions:
      (parsed.agentSuggestions as SiteResearchReport["agentSuggestions"]) ?? [],
  };
}
