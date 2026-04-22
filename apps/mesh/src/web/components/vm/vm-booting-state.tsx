import { Button } from "@deco/ui/components/button.tsx";
import { Loading01, Terminal } from "@untitledui/icons";
import { LiveTimer } from "../live-timer";

interface VmBootingStateProps {
  /** Wall-clock ms when the boot began — feeds the elapsed timer. */
  since: number;
  /** Whether any setup log bytes have arrived over SSE. */
  hasSetupData: boolean;
  /** npm scripts discovered in the repo (emitted after install completes). */
  scripts: string[];
  /** Currently-running script names (e.g. "dev", "start"). */
  activeProcesses: string[];
  /** Opens the env panel so the user can watch raw logs. */
  onViewLogs: () => void;
}

function derivePhase(
  hasSetupData: boolean,
  scripts: string[],
  activeProcesses: string[],
): { title: string; subtitle: string } {
  const runningDev =
    activeProcesses.find((p) => p === "dev" || p === "start") ??
    activeProcesses[0];
  if (runningDev) {
    return {
      title: "Starting dev server",
      subtitle: `Running ${runningDev}…`,
    };
  }
  if (scripts.length > 0) {
    return {
      title: "Almost there",
      subtitle: "Dependencies installed — waiting for the dev server…",
    };
  }
  if (hasSetupData) {
    return {
      title: "Installing dependencies",
      subtitle: "This usually takes 30–90 seconds on a cold start.",
    };
  }
  return {
    title: "Booting sandbox",
    subtitle: "Spinning up the container and cloning the repo…",
  };
}

export function VmBootingState({
  since,
  hasSetupData,
  scripts,
  activeProcesses,
  onViewLogs,
}: VmBootingStateProps) {
  const { title, subtitle } = derivePhase(
    hasSetupData,
    scripts,
    activeProcesses,
  );

  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-4 px-6">
      <div className="relative">
        <Loading01
          size={28}
          className="animate-spin text-muted-foreground/70"
        />
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <h3 className="text-base font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-sm">{subtitle}</p>
      </div>
      <LiveTimer since={since} />
      <Button variant="outline" size="sm" onClick={onViewLogs}>
        <Terminal size={14} />
        View logs
      </Button>
    </div>
  );
}
