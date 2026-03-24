import { Suspense } from "react";
import { Link } from "@tanstack/react-router";
import { useProjectContext } from "@decocms/mesh-sdk";
import { useSpaces } from "@/web/hooks/use-spaces";
import { ProjectCard } from "@/web/components/project-card";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";

function SpacesListContent() {
  const { org } = useProjectContext();
  const spaces = useSpaces();

  const filtered = spaces
    .filter((s) => s.id !== org.id)
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );

  if (filtered.length === 0) return null;

  const visible = filtered.slice(0, 6);

  return (
    <div className="@container w-full">
      <div className="grid grid-cols-1 @lg:grid-cols-2 @3xl:grid-cols-3 gap-4">
        {visible.map((space) => (
          <ProjectCard key={space.id} project={space} />
        ))}
      </div>
      {filtered.length > 6 && (
        <div className="mt-4 text-center">
          <Link
            to="/$org/spaces"
            params={{ org: org.slug }}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            See more
          </Link>
        </div>
      )}
    </div>
  );
}

function SpacesListSkeleton() {
  return (
    <div className="@container w-full">
      <div className="grid grid-cols-1 @lg:grid-cols-2 @3xl:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="border border-border rounded-xl overflow-hidden bg-card"
          >
            <Skeleton className="h-20 w-full" />
            <div className="p-4 space-y-4">
              <Skeleton className="size-10 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SpacesList() {
  return (
    <Suspense fallback={<SpacesListSkeleton />}>
      <SpacesListContent />
    </Suspense>
  );
}
