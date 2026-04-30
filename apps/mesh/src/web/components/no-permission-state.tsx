import { Lock01 } from "@untitledui/icons";
import { Link, useParams } from "@tanstack/react-router";
import { Button } from "@deco/ui/components/button.tsx";
import { EmptyState } from "@/web/components/empty-state";

interface NoPermissionStateProps {
  /** Short label describing what the user tried to access. */
  area?: string;
  /** Optional override for the description body. */
  description?: string;
}

export function NoPermissionState({
  area,
  description,
}: NoPermissionStateProps) {
  const { org } = useParams({ from: "/shell/$org" });
  const title = area ? `No access to ${area}` : "No access";
  const body =
    description ??
    "Your role doesn't include permission for this section. Ask an organization admin to update your role if you need it.";

  return (
    <EmptyState
      image={
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Lock01 size={28} />
        </div>
      }
      title={title}
      description={body}
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link to="/$org/settings/profile" params={{ org }}>
            Go to your profile
          </Link>
        </Button>
      }
    />
  );
}
