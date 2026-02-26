/**
 * SeoReviewMessages
 *
 * Mocked message content for the SEO Optimizer agent task.
 */

import { Loading01 } from "@untitledui/icons";
import { StreamingMessage } from "./streaming-message.tsx";
import { useState } from "react";

type Step = "msg1" | "msg2" | "running";

const MSG1 = `Crawling **farmrio.com.br** for indexability issues. Found 23 product pages missing meta descriptions — that's a direct CTR hit. The 404 on **/colecao/verao-2025** is still receiving **340 hits/hr** from Google.`;

const MSG2 = `Checking SERP features for your top keywords. "vestidos estampados" (34K/mo) has a featured snippet opportunity you're not capturing. Scanning schema markup across 150 product pages...`;

function RunningIndicator() {
  return (
    <div className="mx-4 mt-2 flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
      <Loading01
        size={13}
        className="animate-spin text-muted-foreground shrink-0"
      />
      <p className="text-xs text-muted-foreground">
        Still scanning — analyzing backlink profile and competitor keyword
        gaps...
      </p>
    </div>
  );
}

export function SeoReviewMessages() {
  const [step, setStep] = useState<Step>("msg1");

  return (
    <div className="flex flex-col gap-6 py-6 w-full">
      <div className="w-full min-w-0 flex items-start text-foreground px-4">
        <StreamingMessage
          id="seo-msg-1"
          text={MSG1}
          thinkingMs={400}
          onDone={() => setStep("msg2")}
        />
      </div>

      {(step === "msg2" || step === "running") && (
        <div className="w-full min-w-0 px-4 flex flex-col gap-0">
          <StreamingMessage
            id="seo-msg-2"
            text={MSG2}
            thinkingMs={600}
            charsPerTick={5}
            onDone={() => setStep("running")}
          />
          {step === "running" && <RunningIndicator />}
        </div>
      )}
    </div>
  );
}
