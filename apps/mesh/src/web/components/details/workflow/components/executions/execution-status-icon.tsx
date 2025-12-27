import { CheckCircle, Clock, Loader2, XCircle } from "lucide-react";
import type { ExecutionStatus } from "../types";

export function ExecutionStatusIcon({
  status,
}: {
  status: ExecutionStatus | string;
}) {
  switch (status) {
    case "success":
      return <CheckCircle className="w-4 h-4 text-success" />;
    case "running":
      return <Loader2 className="w-4 h-4 animate-spin text-warning" />;
    case "error":
      return <XCircle className="w-4 h-4 text-destructive" />;
    case "enqueued":
      return <Clock className="w-4 h-4 text-muted-foreground" />;
    default:
      return null;
  }
}
