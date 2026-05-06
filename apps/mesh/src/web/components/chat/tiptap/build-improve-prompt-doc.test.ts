import { describe, expect, test } from "bun:test";
import { buildImprovePromptDoc } from "./build-improve-prompt-doc";
import { derivePartsFromTiptapDoc } from "../derive-parts";

const baseInput = {
  managerAgentId: "agent_mgr_123",
  managerName: "Agent Manager",
  kind: "agent" as const,
  id: "vmcp_abc",
  instructions: "Help users with onboarding.\nBe concise.",
};

describe("buildImprovePromptDoc", () => {
  test("produces a doc whose first inline node is an agent mention", () => {
    const doc = buildImprovePromptDoc(baseInput);
    expect(doc.type).toBe("doc");
    const para = doc.content?.[0];
    expect(para?.type).toBe("paragraph");
    const first = para?.content?.[0];
    expect(first?.type).toBe("mention");
    expect(first?.attrs).toMatchObject({
      id: "agent_mgr_123",
      name: "Agent Manager",
      char: "@",
      metadata: { agentId: "agent_mgr_123", title: "Agent Manager" },
    });
  });

  test("includes XML payload after the mention", () => {
    const doc = buildImprovePromptDoc(baseInput);
    const text = doc.content?.[0]?.content?.[1];
    expect(text?.type).toBe("text");
    expect(text?.text).toContain("<task>improve_instructions</task>");
    expect(text?.text).toContain('<entity kind="agent" id="vmcp_abc"');
    expect(text?.text).toContain("<current_instructions>");
    expect(text?.text).toContain("Help users with onboarding.");
    expect(text?.text).toContain("Be concise.");
    expect(text?.text).toContain("</current_instructions>");
  });

  test("compiles through derivePartsFromTiptapDoc into a DELEGATE directive", () => {
    const doc = buildImprovePromptDoc(baseInput);
    const parts = derivePartsFromTiptapDoc(
      doc as Parameters<typeof derivePartsFromTiptapDoc>[0],
    );
    const text = parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n");
    expect(text).toContain(
      "[DELEGATE TO AGENT: Agent Manager (agent_id: agent_mgr_123)]",
    );
    expect(text).toContain("subtask tool");
    expect(text).toContain("<task>improve_instructions</task>");
  });

  test("handles automation kind", () => {
    const doc = buildImprovePromptDoc({
      managerAgentId: "agent_mgr_auto",
      managerName: "Automation Manager",
      kind: "automation",
      id: "auto_42",
      instructions: "ping every minute",
    });
    const text = doc.content?.[0]?.content?.[1]?.text ?? "";
    expect(text).toContain('<entity kind="automation" id="auto_42"');
  });
});
