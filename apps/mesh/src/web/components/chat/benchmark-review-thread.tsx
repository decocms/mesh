/**
 * BenchmarkReviewMessages
 *
 * Mocked message content for the Competitor Tracker agent task.
 */

import { Loading01 } from "@untitledui/icons";
import { StreamingMessage } from "./streaming-message.tsx";
import { useState } from "react";

type Step = "msg1" | "msg2" | "running";

const MSG1 = `Running competitive analysis for **farmrio.com.br**. **amaro.com** and **roupas.com.br** are growing faster this month — amaro up +15%, roupas up +48%. They're both investing heavily in paid search.`;

const MSG2 = `Scanning competitor content activity. amaro.com published **12 new collection pages** this week. roupas.com.br dropped prices on 3 categories — potential defensive move. Checking social media follower trends...`;

function RunningIndicator() {
  return (
    <div className="mx-4 mt-2 flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
      <Loading01
        size={13}
        className="animate-spin text-muted-foreground shrink-0"
      />
      <p className="text-xs text-muted-foreground">
        Still scanning — analyzing ad spend signals and keyword overlap...
      </p>
    </div>
  );
}

export function BenchmarkReviewMessages() {
  const [step, setStep] = useState<Step>("msg1");

  return (
    <div className="flex flex-col gap-6 py-6 w-full">
      <div className="w-full min-w-0 flex items-start text-foreground px-4">
        <StreamingMessage
          id="bench-msg-1"
          text={MSG1}
          thinkingMs={400}
          onDone={() => setStep("msg2")}
        />
      </div>

      {(step === "msg2" || step === "running") && (
        <div className="w-full min-w-0 px-4 flex flex-col gap-0">
          <StreamingMessage
            id="bench-msg-2"
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
