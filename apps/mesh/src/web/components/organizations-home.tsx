import { authClient } from "@/web/lib/auth-client";
import { useNavigate } from "@tanstack/react-router";
import { EntityCard } from "@deco/ui/components/entity-card.tsx";
import { EntityGrid } from "@deco/ui/components/entity-grid.tsx";
import { AlertCircle, Plus } from "@untitledui/icons";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Suspense, useState, useDeferredValue } from "react";
import { CreateOrganizationDialog } from "./create-organization-dialog";

function OrganizationsGrid({ query }: { query?: string }) {
  const { data: organizations } = authClient.useListOrganizations();
  const navigate = useNavigate();

  // Filter organizations based on search query
  const filteredOrganizations = !organizations
    ? []
    : !query
      ? organizations
      : (() => {
          const searchLower = query.toLowerCase();
          return organizations.filter(
            (org) =>
              org.name.toLowerCase().includes(searchLower) ||
              org.slug.toLowerCase().includes(searchLower),
          );
        })();

  if (!organizations || organizations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 p-8">
        <div className="text-sm text-muted-foreground text-center">
          No organizations yet. Create your first organization to get started.
        </div>
      </div>
    );
  }

  if (filteredOrganizations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 p-8">
        <div className="text-sm text-muted-foreground text-center">
          No organizations found matching "{query}".
        </div>
      </div>
    );
  }

  return (
    <EntityGrid columns={{ sm: 2, md: 3, lg: 4 }}>
      {filteredOrganizations.map((org) => (
        <EntityCard
          key={org.id}
          onNavigate={() =>
            navigate({ to: "/$org", params: { org: org.slug } })
          }
        >
          <EntityCard.Header>
            <EntityCard.AvatarSection>
              <EntityCard.Avatar
                url={org.logo || ""}
                fallback={org.name}
                size="lg"
                objectFit="contain"
              />
            </EntityCard.AvatarSection>
            <EntityCard.Content>
              <EntityCard.Subtitle>@{org.slug}</EntityCard.Subtitle>
              <EntityCard.Title>{org.name}</EntityCard.Title>
            </EntityCard.Content>
          </EntityCard.Header>
          <EntityCard.Footer>
            <div className="text-xs text-muted-foreground">
              Created:{" "}
              {new Date(org.createdAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </div>
          </EntityCard.Footer>
        </EntityCard>
      ))}
    </EntityGrid>
  );
}

function ErrorState({ error }: { error: Error }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 p-8">
      <AlertCircle size={24} className="text-destructive" />
      <div className="text-sm text-muted-foreground text-center">
        Error loading organizations: {error.message}
      </div>
    </div>
  );
}

export function OrganizationsHome() {
  const { error, isPending } = authClient.useListOrganizations();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const deferredQuery = useDeferredValue(searchQuery);

  if (isPending) {
    return (
      <div className="max-w-6xl mx-auto p-8">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-medium">My organizations</h2>
        </div>
        <div className="@container">
          <EntityGrid.Skeleton count={8} columns={{ sm: 2, md: 3, lg: 4 }} />
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  return (
    <div className="max-w-6xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-xl font-medium">My organizations</h2>
        <div className="flex items-center gap-2">
          <Input
            className="max-w-xs"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Button variant="default" onClick={() => setIsCreateDialogOpen(true)}>
            <Plus size={16} />
            <span>New organization</span>
          </Button>
        </div>
      </div>
      <div className="@container">
        <Suspense
          fallback={
            <EntityGrid.Skeleton count={8} columns={{ sm: 2, md: 3, lg: 4 }} />
          }
        >
          <OrganizationsGrid query={deferredQuery} />
        </Suspense>
      </div>

      <CreateOrganizationDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />
    </div>
  );
}
