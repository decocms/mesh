import { useMemo, useState } from "react";
import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Card } from "@deco/ui/components/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import { Label } from "@deco/ui/components/label.tsx";
import { Textarea } from "@deco/ui/components/textarea.tsx";
import {
  CheckCircle,
  Eye,
  LinkExternal01,
  Trash01,
  XCircle,
} from "@untitledui/icons";
import { toast } from "sonner";
import { PLUGIN_ID } from "../../shared";
import {
  usePublishRequestMutations,
  usePublishRequests,
  useRegistryConfig,
  useRegistryFilters,
  useRegistryMutations,
} from "../hooks/use-registry";
import type {
  PublishRequest,
  PublishRequestStatus,
  RegistryCreateInput,
  RegistryUpdateInput,
} from "../lib/types";
import { RegistryItemDialog } from "./registry-item-dialog";

const STATUS_OPTIONS: Array<{ value: PublishRequestStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function requestToDraft(request: PublishRequest) {
  return {
    id: request.server?.name,
    title: request.title,
    description: request.description ?? "",
    _meta: request._meta,
    server: request.server,
    is_public: false,
  };
}

function getIconUrl(request: PublishRequest): string | null {
  const icon = request.server?.icons?.[0]?.src;
  return typeof icon === "string" && icon.length > 0 ? icon : null;
}

function getReadmeMeta(request: PublishRequest): {
  hasReadmeContent: boolean;
  hasReadmeLink: boolean;
  readmeContent: string;
  readmeUrl: string;
} {
  const meshMeta = request._meta?.["mcp.mesh"];
  return {
    hasReadmeContent: Boolean(meshMeta?.readme?.trim()),
    hasReadmeLink: Boolean(meshMeta?.readme_url?.trim()),
    readmeContent: meshMeta?.readme?.trim() ?? "",
    readmeUrl: meshMeta?.readme_url?.trim() ?? "",
  };
}

export default function RegistryRequestsPage() {
  const [status, setStatus] = useState<PublishRequestStatus>("pending");
  const [approveOpen, setApproveOpen] = useState(false);
  const [approvingRequest, setApprovingRequest] =
    useState<PublishRequest | null>(null);
  const [rejectingRequest, setRejectingRequest] =
    useState<PublishRequest | null>(null);
  const [viewingRequest, setViewingRequest] = useState<PublishRequest | null>(
    null,
  );
  const [rejectNotes, setRejectNotes] = useState("");

  const listQuery = usePublishRequests(status);
  const { reviewMutation, deleteMutation } = usePublishRequestMutations();
  const { createMutation } = useRegistryMutations();
  const filtersQuery = useRegistryFilters();
  const { registryLLMConnectionId, registryLLMModelId } =
    useRegistryConfig(PLUGIN_ID);

  const requests = listQuery.data?.items ?? [];
  const totalCount = listQuery.data?.totalCount ?? 0;
  const tags = filtersQuery.data?.tags?.map((item) => item.value) ?? [];
  const categories =
    filtersQuery.data?.categories?.map((item) => item.value) ?? [];

  const pendingById = useMemo(
    () =>
      new Set(
        requests
          .filter((request) => request.status === "pending")
          .map((request) => request.id),
      ),
    [requests],
  );

  const handleApprove = (request: PublishRequest) => {
    setApprovingRequest(request);
    setApproveOpen(true);
  };

  const handleApproveSubmit = async (
    payload: RegistryCreateInput | { id: string; data: RegistryUpdateInput },
  ) => {
    if (!approvingRequest) return;
    if ("data" in payload) {
      throw new Error("Unexpected update payload while approving a request");
    }

    try {
      await createMutation.mutateAsync(payload);
      await reviewMutation.mutateAsync({
        id: approvingRequest.id,
        status: "approved",
        reviewerNotes: null,
      });
      toast.success("Request approved and saved to registry");
      setApproveOpen(false);
      setApprovingRequest(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to approve request",
      );
      throw error;
    }
  };

  const handleReject = async () => {
    if (!rejectingRequest) return;
    try {
      await reviewMutation.mutateAsync({
        id: rejectingRequest.id,
        status: "rejected",
        reviewerNotes: rejectNotes.trim() || null,
      });
      toast.success("Request rejected");
      setRejectingRequest(null);
      setRejectNotes("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to reject request",
      );
    }
  };

  const handleDelete = async (request: PublishRequest) => {
    try {
      await deleteMutation.mutateAsync(request.id);
      toast.success("Request deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete request",
      );
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 border-b border-border">
        <div className="h-12 px-4 md:px-6 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-medium">Requests to Publish</h2>
            <Badge variant="secondary" className="text-xs">
              {totalCount}
            </Badge>
          </div>
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  status === option.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setStatus(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 md:px-6 py-4">
        {listQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">
            Loading requests...
          </div>
        ) : requests.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No publish requests yet.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {requests.map((request) => {
              const remoteUrl = request.server?.remotes?.[0]?.url ?? "-";
              const iconUrl = getIconUrl(request);
              const readmeMeta = getReadmeMeta(request);
              const tags = request._meta?.["mcp.mesh"]?.tags ?? [];
              const categories = request._meta?.["mcp.mesh"]?.categories ?? [];
              return (
                <Card key={request.id} className="p-4 grid gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex items-start gap-2">
                      <div className="size-9 rounded-md border border-border bg-muted/30 overflow-hidden shrink-0 flex items-center justify-center">
                        {iconUrl ? (
                          <img
                            src={iconUrl}
                            alt={request.title}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span className="text-[10px] font-semibold text-muted-foreground">
                            {request.title.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {request.title}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {remoteUrl}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="capitalize">
                      {request.status}
                    </Badge>
                  </div>

                  <p className="text-sm text-muted-foreground line-clamp-2 min-h-10">
                    {request.description || "No description provided."}
                  </p>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {readmeMeta.hasReadmeContent && (
                      <Badge variant="outline" className="text-[11px]">
                        README content
                      </Badge>
                    )}
                    {readmeMeta.hasReadmeLink && (
                      <Badge variant="outline" className="text-[11px]">
                        README link
                      </Badge>
                    )}
                    {tags.slice(0, 2).map((tag) => (
                      <Badge
                        key={`${request.id}-tag-${tag}`}
                        variant="secondary"
                        className="text-[11px]"
                      >
                        {tag}
                      </Badge>
                    ))}
                    {categories.slice(0, 1).map((category) => (
                      <Badge
                        key={`${request.id}-category-${category}`}
                        variant="secondary"
                        className="text-[11px]"
                      >
                        {category}
                      </Badge>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                    <div>
                      <p className="font-medium text-foreground">Requester</p>
                      <p className="truncate">
                        {request.requester_name || "-"}
                      </p>
                      <p className="truncate">
                        {request.requester_email || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Submitted</p>
                      <p>{formatDate(request.created_at)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      onClick={() => setViewingRequest(request)}
                    >
                      <Eye size={14} />
                      View details
                    </Button>
                    {pendingById.has(request.id) ? (
                      <>
                        <Button
                          size="sm"
                          className="h-8"
                          onClick={() => handleApprove(request)}
                          disabled={
                            reviewMutation.isPending || createMutation.isPending
                          }
                        >
                          <CheckCircle size={14} />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => {
                            setRejectingRequest(request);
                            setRejectNotes("");
                          }}
                          disabled={reviewMutation.isPending}
                        >
                          <XCircle size={14} />
                          Reject
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => handleDelete(request)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash01 size={14} />
                        Delete
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <RegistryItemDialog
        key={approvingRequest?.id ?? "approve-request"}
        open={approveOpen}
        onOpenChange={(next) => {
          setApproveOpen(next);
          if (!next) {
            setApprovingRequest(null);
          }
        }}
        draft={approvingRequest ? requestToDraft(approvingRequest) : null}
        availableTags={tags}
        availableCategories={categories}
        defaultLLMConnectionId={registryLLMConnectionId}
        defaultLLMModelId={registryLLMModelId}
        isSubmitting={createMutation.isPending || reviewMutation.isPending}
        onSubmit={handleApproveSubmit}
      />

      <Dialog
        open={Boolean(viewingRequest)}
        onOpenChange={(next) => {
          if (!next) {
            setViewingRequest(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {viewingRequest?.title ?? "Request details"}
            </DialogTitle>
            <DialogDescription>
              Review all metadata sent by the requester before approving.
            </DialogDescription>
          </DialogHeader>
          {viewingRequest && (
            <div className="flex-1 overflow-y-auto pr-1 space-y-4">
              <div className="rounded-lg border border-border bg-muted/20 p-3 flex items-center gap-3">
                <div className="size-16 rounded-lg border border-border bg-muted/30 overflow-hidden shrink-0 flex items-center justify-center">
                  {getIconUrl(viewingRequest) ? (
                    <img
                      src={getIconUrl(viewingRequest) || ""}
                      alt={viewingRequest.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-lg font-semibold text-muted-foreground">
                      {viewingRequest.title.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {viewingRequest.title}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {viewingRequest.server?.name || viewingRequest.id}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="grid gap-1">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <span className="capitalize">{viewingRequest.status}</span>
                </div>
                <div className="grid gap-1">
                  <span className="text-xs text-muted-foreground">
                    Submitted
                  </span>
                  <span>{formatDate(viewingRequest.created_at)}</span>
                </div>
                <div className="grid gap-1">
                  <span className="text-xs text-muted-foreground">
                    Requester
                  </span>
                  <span>{viewingRequest.requester_name || "-"}</span>
                </div>
                <div className="grid gap-1">
                  <span className="text-xs text-muted-foreground">Email</span>
                  <span>{viewingRequest.requester_email || "-"}</span>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label>Remote URL</Label>
                <code className="text-xs rounded-md border border-border bg-muted/30 px-2.5 py-2 break-all">
                  {viewingRequest.server?.remotes?.[0]?.url ?? "-"}
                </code>
              </div>

              <div className="grid gap-1.5">
                <Label>Description</Label>
                <p className="text-sm text-muted-foreground">
                  {viewingRequest.description || "No description provided."}
                </p>
              </div>

              <div className="grid gap-1.5">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-1.5">
                  {(viewingRequest._meta?.["mcp.mesh"]?.tags ?? []).length ? (
                    (viewingRequest._meta?.["mcp.mesh"]?.tags ?? []).map(
                      (tag) => (
                        <Badge
                          key={`${viewingRequest.id}-detail-tag-${tag}`}
                          variant="secondary"
                        >
                          {tag}
                        </Badge>
                      ),
                    )
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label>Categories</Label>
                <div className="flex flex-wrap gap-1.5">
                  {(viewingRequest._meta?.["mcp.mesh"]?.categories ?? [])
                    .length ? (
                    (viewingRequest._meta?.["mcp.mesh"]?.categories ?? []).map(
                      (category) => (
                        <Badge
                          key={`${viewingRequest.id}-detail-category-${category}`}
                          variant="secondary"
                        >
                          {category}
                        </Badge>
                      ),
                    )
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label>README</Label>
                {getReadmeMeta(viewingRequest).hasReadmeContent ? (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap max-h-40 overflow-y-auto rounded-md border border-border bg-muted/20 px-2.5 py-2">
                    {getReadmeMeta(viewingRequest).readmeContent}
                  </p>
                ) : getReadmeMeta(viewingRequest).hasReadmeLink ? (
                  <a
                    href={getReadmeMeta(viewingRequest).readmeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm inline-flex items-center gap-1.5 text-primary hover:underline"
                  >
                    Open README link
                    <LinkExternal01 size={14} />
                  </a>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    No README provided.
                  </span>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingRequest(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(rejectingRequest)}
        onOpenChange={(next) => {
          if (!next) {
            setRejectingRequest(null);
            setRejectNotes("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject publish request?</DialogTitle>
            <DialogDescription>
              This request will move to rejected status. You can leave optional
              notes for context.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="reject-notes">Reviewer notes (optional)</Label>
            <Textarea
              id="reject-notes"
              rows={4}
              value={rejectNotes}
              onChange={(event) => setRejectNotes(event.target.value)}
              placeholder="Reason for rejection..."
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectingRequest(null);
                setRejectNotes("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleReject} disabled={reviewMutation.isPending}>
              {reviewMutation.isPending ? "Rejecting..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
