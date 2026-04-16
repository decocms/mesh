import { Button } from "@deco/ui/components/button.tsx";
import { Server01 } from "@untitledui/icons";

interface VmSuspendedStateProps {
  onResume: () => void;
  label?: string;
}

export function VmSuspendedState({
  onResume,
  label = "Resume Server",
}: VmSuspendedStateProps) {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-4">
      <p className="text-sm text-muted-foreground">
        VM suspended due to inactivity.
      </p>
      <Button onClick={onResume}>
        <Server01 size={14} />
        {label}
      </Button>
    </div>
  );
}
