import { cn } from "@deco/ui/lib/utils.ts";
import { CheckCircle, Clock, Loading01 } from "@untitledui/icons";
import { useResearchSessions } from "../hooks/use-research-sessions";

interface ResearchListProps {
  onSelect: (sessionId: string) => void;
}

export default function ResearchList({ onSelect }: ResearchListProps) {
  const { data: sessions, isLoading } = useResearchSessions();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loading01 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1 mb-2">
        Previous Analyses
      </h3>
      {sessions.map(({ sessionId, meta }) => (
        <button
          key={sessionId}
          type="button"
          onClick={() => onSelect(sessionId)}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-left",
            "hover:bg-accent transition-colors",
          )}
        >
          {meta.status === "completed" ? (
            <CheckCircle size={16} className="text-emerald-500 shrink-0" />
          ) : (
            <Clock size={16} className="text-muted-foreground shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {meta.url}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(meta.startedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          {meta.status === "completed" && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              Complete
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
