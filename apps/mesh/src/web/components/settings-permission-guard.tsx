import { useCurrentMemberPermissions } from "@/web/hooks/use-member-permissions";
import { Page } from "@/web/components/page";
import { Button } from "@deco/ui/components/button.tsx";
import { Loading01, Lock01 } from "@untitledui/icons";
import { Link, useParams } from "@tanstack/react-router";
import type { ReactNode } from "react";

interface SettingsPermissionGuardProps {
  requiredTool: string;
  children: ReactNode;
}

export function SettingsPermissionGuard({
  requiredTool,
  children,
}: SettingsPermissionGuardProps) {
  const perms = useCurrentMemberPermissions();
  const { org } = useParams({ from: "/shell/$org" });

  if (perms.isLoading) {
    return (
      <Page>
        <div className="flex items-center justify-center h-full">
          <Loading01 size={32} className="animate-spin text-muted-foreground" />
        </div>
      </Page>
    );
  }

  const hasAccess =
    perms.isAdmin ||
    perms.hasAll ||
    (requiredTool !== "__admin_only__" && perms.tools.has(requiredTool));

  if (!hasAccess) {
    return (
      <Page>
        <div className="flex flex-col items-center justify-center gap-6 h-full text-center px-4">
          <div className="flex items-center justify-center size-12 rounded-full bg-muted">
            <Lock01 size={20} className="text-muted-foreground" />
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">Access restricted</h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              You don&apos;t have permission to view this page. Contact your
              organization admin to request access.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/$org" params={{ org }}>
              Go back to home
            </Link>
          </Button>
        </div>
      </Page>
    );
  }

  return <>{children}</>;
}
