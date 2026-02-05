import { EmptyState } from "@/web/components/empty-state.tsx";
import { CheckDone01 } from "@untitledui/icons";

export default function TasksPage() {
  return (
    <div className="flex-1 flex flex-col h-full">
      <EmptyState
        image={
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted">
            <CheckDone01 size={32} className="text-muted-foreground" />
          </div>
        }
        title="Tasks"
        description="Manage agent tasks and track progress on project goals. Coming soon."
      />
    </div>
  );
}
