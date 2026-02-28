import { Button } from "@deco/ui/components/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deco/ui/components/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@deco/ui/components/breadcrumb.tsx";
import { BarChart01, Plus, Trash01 } from "@untitledui/icons";
import { useState } from "react";
import type { Collection } from "../lib/types";

interface CollectionsListProps {
  collections: Collection[];
  onSelectCollection: (id: string) => void;
  onAddCollection: (input: {
    name: string;
    vtexCollectionId: string;
  }) => Promise<void>;
  onDeleteCollection: (id: string) => Promise<void>;
}

export default function CollectionsList({
  collections,
  onSelectCollection,
  onAddCollection,
  onDeleteCollection,
}: CollectionsListProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [vtexCollectionId, setVtexCollectionId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setVtexCollectionId("");
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) resetForm();
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    const trimmedVtexId = vtexCollectionId.trim();
    if (!trimmedName || !trimmedVtexId) return;
    setIsSubmitting(true);
    try {
      await onAddCollection({
        name: trimmedName,
        vtexCollectionId: trimmedVtexId,
      });
      handleOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDeleteCollection(id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 w-full border-b border-border h-12 overflow-x-auto flex items-center justify-between gap-3 px-4 min-w-max">
        <div className="flex items-center gap-2 shrink-0 overflow-hidden">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Collection Ranking</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <Button size="sm" onClick={() => setIsOpen(true)}>
          <Plus size={14} className="mr-1" />
          Add Collection
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {collections.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <BarChart01 size={48} className="text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No collections yet</h3>
            <p className="text-muted-foreground max-w-sm">
              Add your first collection to start viewing collection-specific
              reports.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {collections.map((collection) => (
              <Card
                key={collection.id}
                className="group relative cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => onSelectCollection(collection.id)}
              >
                <CardHeader className="pb-2 pt-5 px-5">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-sm leading-snug line-clamp-2">
                      {collection.name}
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      disabled={deletingId === collection.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDelete(collection.id);
                      }}
                    >
                      <Trash01 size={14} />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  <CardDescription className="text-xs">
                    VTEX Collection ID:{" "}
                    <span className="font-mono text-foreground">
                      {collection.vtexCollectionId}
                    </span>
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Collection</DialogTitle>
            <DialogDescription>
              Configure a collection name and VTEX collection ID.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Collection name"
            />
            <Input
              value={vtexCollectionId}
              onChange={(event) => setVtexCollectionId(event.target.value)}
              placeholder="VTEX collection ID"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreate()}
              disabled={
                isSubmitting || !name.trim() || !vtexCollectionId.trim()
              }
            >
              {isSubmitting ? "Saving..." : "Save collection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
