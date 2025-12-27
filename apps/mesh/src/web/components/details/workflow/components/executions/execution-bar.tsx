import React from "react";
import { useMembers } from "@/web/hooks/use-members";
import { ListRow } from "@/web/components/list-row.tsx";
import { ExecutionStatusIcon } from "./execution-status-icon";
import { useWorkflowExecutionById } from "./hooks/use-workflow-execution-by-id";

export const ExecutionBar = React.forwardRef<
  HTMLDivElement,
  {
    executionId: string;
    isSelected: boolean;
    onClick: () => void;
  }
>(function ExecutionBar({ executionId, isSelected, onClick }, ref) {
  const { data } = useMembers();
  const execution = useWorkflowExecutionById(executionId);

  if (!execution) return null;

  const memberName = data?.data?.members.find(
    (m) => m.userId === execution.created_by,
  )?.user?.name;

  return (
    <div ref={ref}>
      <ListRow selected={isSelected} onClick={onClick}>
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
    </div>
  );
});
