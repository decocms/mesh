import { Button } from "@decocms/ui/components/button.tsx";
import { toast } from "sonner";

interface VmErrorStateProps {
  errorMsg: string;
  onRetry: () => void;
}

export function VmErrorState({ errorMsg, onRetry }: VmErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-4 px-4">
      <div className="max-w-md w-full rounded-md border border-destructive/30 bg-destructive/5 p-3">
        <p className="text-sm text-destructive line-clamp-4 break-all">
          {errorMsg}
        </p>
        <button
          type="button"
          onClick={() =>
            navigator.clipboard.writeText(errorMsg).then(() => {
              toast.success("Error copied to clipboard");
            })
          }
          className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Copy error
        </button>
      </div>
      <Button variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
