/**
 * BlogPostMessages
 *
 * Mocked message content for the Blog Post Generator task.
 * Rendered inside the existing ChatPanel shell (side-panel-chat.tsx).
 * Shows thinking → streaming message 1 → thinking → streaming message 2 → artifact.
 */

import { useState } from "react";
import { Button } from "@deco/ui/components/button.tsx";
import { useNavigate } from "@tanstack/react-router";
import { useProjectContext } from "@decocms/mesh-sdk";
import { StreamingMessage } from "./streaming-message.tsx";
import { ArrowRight, ArrowUpRight, Check, File06 } from "@untitledui/icons";

// ─── Blog artifact ────────────────────────────────────────────────────────────

function BlogArtifact() {
  const { org, project } = useProjectContext();
  const navigate = useNavigate();

  function handleOpen() {
    navigate({
      to: "/$org/$project/blog",
      params: { org: org.slug, project: project.slug },
      search: { taskId: "bp-1" },
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden mt-2">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <File06 size={13} className="text-violet-500" />
          <span className="text-xs font-medium text-foreground">
            Blog post draft
          </span>
        </div>
        <button
          type="button"
          onClick={handleOpen}
          className="flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-700 transition-colors"
        >
          Open in Blog
          <ArrowUpRight size={11} />
        </button>
      </div>

      <div className="px-4 py-3 flex flex-col gap-2">
        <p className="text-sm font-semibold text-foreground leading-snug">
          Best Smart Home Accessories Under $50
        </p>
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          The smart home revolution is here — and it doesn&apos;t require a
          five-figure budget. With the right accessories, you can automate your
          home for under $50 per device and still get a seamless experience.
        </p>
        <div className="flex items-center gap-3 pt-0.5">
          <span className="text-xs text-muted-foreground">
            1,240 words · 5 min read
          </span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
            <Check size={10} />
            SEO optimised
          </span>
        </div>
      </div>

      <div className="px-4 py-3 border-t border-border bg-muted/10">
        <Button size="sm" className="w-full" onClick={handleOpen}>
          Review & approve draft
          <ArrowRight size={13} />
        </Button>
      </div>
    </div>
  );
}

// ─── Message sequence ─────────────────────────────────────────────────────────

type Step = "msg1" | "msg2" | "artifact";

const MSG1 = `I'll write a blog post targeting **"best smart home accessories under $50"** — 18K monthly searches, low competition. Your brand voice is clear from the site analysis so I'll match the tone.`;

const MSG2 = "Done. Here's your draft:";

export function BlogPostMessages() {
  const [step, setStep] = useState<Step>("msg1");

  return (
    <div className="flex flex-col gap-6 py-6 w-full">
      {/* Message 1 */}
      <div className="w-full min-w-0 flex items-start text-foreground px-4">
        <StreamingMessage
          id="blog-msg-1"
          text={MSG1}
          thinkingMs={500}
          onDone={() => setStep("msg2")}
        />
      </div>

      {/* Message 2 — appears after msg1 done */}
      {(step === "msg2" || step === "artifact") && (
        <div className="w-full min-w-0 px-4 flex flex-col gap-0">
          <StreamingMessage
            id="blog-msg-2"
            text={MSG2}
            thinkingMs={400}
            charsPerTick={6}
            onDone={() => setStep("artifact")}
          />
          {step === "artifact" && <BlogArtifact />}
        </div>
      )}
    </div>
  );
}
