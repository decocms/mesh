import { Badge } from "@deco/ui/components/badge.tsx";
import { AlertCircle, CheckCircle } from "@untitledui/icons";

type ConnectionStatusValue = "active" | "inactive" | "error";

export function ConnectionStatus({
  status,
}: {
  status: ConnectionStatusValue;
}) {
  if (status === "active") {
    return (
      <Badge
        variant="success"
        className="gap-1.5 text-success border-success/40 bg-background"
      >
        <CheckCircle size={12} />
        Active
      </Badge>
    );
  }

  if (status === "error") {
    return (
      <Badge
        variant="outline"
        className="gap-1.5 text-destructive border-destructive/40 bg-background"
      >
        <AlertCircle size={12} />
        Error
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-muted-foreground">
      Inactive
    </Badge>
  );
}
