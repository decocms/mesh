import { useState } from "react";
import { useWidget } from "./use-widget.ts";

type CounterArgs = { initialValue?: number; label?: string };

export default function Counter() {
  const { args } = useWidget<CounterArgs>();
  const [delta, setDelta] = useState(0);

  if (!args) return null;

  const count = (args.initialValue ?? 0) + delta;

  return (
    <div className="flex flex-col items-center gap-3 p-4 font-sans">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {args.label ?? "Counter"}
      </span>
      <span className="text-4xl font-bold text-foreground tabular-nums">
        {count}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setDelta((d) => d - 1)}
          className="size-9 rounded-lg border border-border bg-background text-foreground text-lg font-medium hover:bg-accent transition-colors flex items-center justify-center"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => setDelta((d) => d + 1)}
          className="size-9 rounded-lg border border-border bg-background text-foreground text-lg font-medium hover:bg-accent transition-colors flex items-center justify-center"
        >
          +
        </button>
      </div>
    </div>
  );
}
