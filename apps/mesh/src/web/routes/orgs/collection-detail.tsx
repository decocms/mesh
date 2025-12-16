import { UNKNOWN_CONNECTION_ID, createToolCaller } from "@/tools/client";
import { AgentDetailsView } from "@/web/components/details/agent.tsx";
import { ToolDetailsView } from "@/web/components/details/tool.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { useCollectionActions } from "@/web/hooks/use-collections";
import { EmptyState } from "@deco/ui/components/empty-state.tsx";
import { useParams, useRouter } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Suspense, type ComponentType } from "react";
import {
  WorkflowDetailsView,
  WorkflowExecutionDetailsView,
} from "@/web/components/details/workflow/index.tsx";

interface CollectionDetailsProps {
  itemId: string;
  onBack: () => void;
  onUpdate: (updates: Record<string, unknown>) => Promise<void>;
}

// Map of well-known views by collection name
const WELL_KNOWN_VIEW_DETAILS: Record<
  string,
  ComponentType<CollectionDetailsProps>
> = {
  agent: AgentDetailsView,
  workflow: WorkflowDetailsView,
  workflow_execution: WorkflowExecutionDetailsView,
};

function ToolDetailsContent() {
  const router = useRouter();
  const params = useParams({
    from: "/shell/$org/mcps/$connectionId/$collectionName/$itemId",
  });

  const itemId = decodeURIComponent(params.itemId);

  const handleBack = () => {
    router.history.back();
  };

  const handleUpdate = async (_updates: Record<string, unknown>) => {
    // Tools don't use collections, so updates are handled by ToolDetailsView
    // This is a no-op for tools since they don't have collection-based updates
    return Promise.resolve();
  };

  return (
    <ToolDetailsView
      itemId={itemId}
      onBack={handleBack}
      onUpdate={handleUpdate}
    />
  );
}

function CollectionDetailsContent() {
  const router = useRouter();
  const params = useParams({
    from: "/shell/$org/mcps/$connectionId/$collectionName/$itemId",
  });

  const connectionId = params.connectionId;
  const collectionName = decodeURIComponent(params.collectionName);
  const itemId = decodeURIComponent(params.itemId);

  const handleBack = () => {
    router.history.back();
  };

  const safeConnectionId = connectionId ?? UNKNOWN_CONNECTION_ID;
  const toolCaller = createToolCaller(safeConnectionId);

  const actions = useCollectionActions(
    safeConnectionId,
    collectionName,
    toolCaller,
  );

  const handleUpdate = async (updates: Record<string, unknown>) => {
    if (!itemId) return;
    await actions.update.mutateAsync({
      id: itemId,
      data: updates,
    });
    // Success/error toasts are handled by the mutation's onSuccess/onError
  };

  // Check for well-known collections (case insensitive, singular/plural)
  const normalizedCollectionName = collectionName?.toLowerCase();

  const ViewComponent =
    normalizedCollectionName &&
    WELL_KNOWN_VIEW_DETAILS[normalizedCollectionName];

  if (ViewComponent) {
    return (
      <ViewComponent
        itemId={itemId}
        onBack={handleBack}
        onUpdate={handleUpdate}
      />
    );
  }

  return (
    <EmptyState
      icon="extension"
      title="No component defined"
      description="No component for this collection was defined"
      buttonProps={{
        onClick: handleBack,
        children: "Go back",
      }}
    />
  );
}

function CollectionDetailsRouter() {
  const params = useParams({
    from: "/shell/$org/mcps/$connectionId/$collectionName/$itemId",
  });

  const collectionName = decodeURIComponent(params.collectionName);

  const isTools = collectionName === "tools";

  if (isTools) {
    return <ToolDetailsContent />;
  }

  return <CollectionDetailsContent />;
}

export default function CollectionDetails() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <CollectionDetailsRouter />
      </Suspense>
    </ErrorBoundary>
  );
}
