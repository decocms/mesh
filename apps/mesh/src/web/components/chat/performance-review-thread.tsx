/**
 * PerformanceReviewMessages
 *
 * Mocked message content for the Performance Monitor agent task.
 * Shows the agent actively analyzing site performance — still in progress.
 */

import { Loading01 } from "@untitledui/icons";
import { StreamingMessage } from "./streaming-message.tsx";
import { useState } from "react";

type Step = "msg1" | "msg2" | "running";

const MSG1 = `Pulling latest field data for **farmrio.com.br**... LCP on collection pages is still **4.2s** — hero images loading unoptimized. TTFB averaging 420ms, which is 2× the recommended threshold.`;

const MSG2 = `Running Lighthouse audit across 12 key URLs. Cache hit rate sitting at **12%** — industry average for fashion e-commerce is 65%. Found unused JavaScript adding 340KB to render-blocking time.`;

function RunningIndicator() {
  return (
    <div className="mx-4 mt-2 flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
      <Loading01
        size={13}
        className="animate-spin text-muted-foreground shrink-0"
      />
      <p className="text-xs text-muted-foreground">
        Still scanning — checking CDN performance and mobile metrics...
      </p>
    </div>
  );
}

export function PerformanceReviewMessages() {
  const [step, setStep] = useState<Step>("msg1");

  return (
    <div className="flex flex-col gap-6 py-6 w-full">
      <div className="w-full min-w-0 flex items-start text-foreground px-4">
        <StreamingMessage
          id="perf-msg-1"
          text={MSG1}
          thinkingMs={400}
          onDone={() => setStep("msg2")}
        />
      </div>

      {(step === "msg2" || step === "running") && (
        <div className="w-full min-w-0 px-4 flex flex-col gap-0">
          <StreamingMessage
            id="perf-msg-2"
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
