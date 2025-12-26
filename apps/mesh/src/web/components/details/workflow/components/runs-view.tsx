import { ScrollArea } from "@deco/ui/components/scroll-area.tsx";
import { useWorkflow } from "../stores/workflow";
import { useWorkflowExecutionCollectionList } from "../hooks/use-workflow-collection-item";
import { usePanelsActions, useViewingRunId } from "../stores/panels";
import { ListRow } from "@/web/components/list-row.tsx";
import { CheckCircle, Clock, Loader2, XCircle } from "lucide-react";
import { useMembers } from "@/web/hooks/use-members";

const ExecutionStatusIcon = ({ status }: { status: string }) => {
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
};

function RunListItem({ execution }: { execution: { id: string; status: string; created_at: string; created_by?: string } }) {
  const { setViewingRunId } = usePanelsActions();
  const viewingRunId = useViewingRunId();
  const { data } = useMembers();
  const isSelected = viewingRunId === execution.id;

  const memberName = data?.data?.members.find(
    (m) => m.userId === execution.created_by,
  )?.user?.name;

  return (
    <ListRow
      selected={isSelected}
      onClick={() => setViewingRunId(execution.id)}
      className="border border-border rounded-lg"
    >
      <ListRow.Icon>
        <ExecutionStatusIcon status={execution.status} />
      </ListRow.Icon>
      <ListRow.Content className="flex items-center gap-2">
        <ListRow.Title>
          {new Date(execution.created_at).toLocaleString()}
        </ListRow.Title>
        <ListRow.Subtitle>{execution.id.slice(0, 8)}...</ListRow.Subtitle>
      </ListRow.Content>
      {memberName && (
        <ListRow.Trailing className="text-xs font-medium text-muted-foreground">
          {memberName}
        </ListRow.Trailing>
      )}
    </ListRow>
  );
}

export function WorkflowRunsView() {
  const workflow = useWorkflow();
  const { list: executions } = useWorkflowExecutionCollectionList({
    workflowId: workflow.id,
  });

  return (
    <div className="h-full flex flex-col bg-background">
      <ScrollArea className="flex-1">
        <div className="p-4">
          {executions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-muted-foreground">
                No runs yet. Execute the workflow to see runs here.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {executions.map((execution) => (
                <RunListItem key={execution.id} execution={execution} />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

