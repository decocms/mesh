import { useEffect, useState } from "react";
import { formatDuration } from "@/web/lib/format-time";

export function LiveTimer({ since }: { since: number }) {
  const [elapsed, setElapsed] = useState(() => Date.now() - since);

  // oxlint-disable-next-line ban-use-effect/ban-use-effect -- interval required for live elapsed timer
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - since), 100);
    return () => clearInterval(id);
  }, [since]);

  return (
    <span className="tabular-nums text-sm font-mono text-muted-foreground/50">
      {formatDuration(elapsed / 1000)}
    </span>
  );
}
