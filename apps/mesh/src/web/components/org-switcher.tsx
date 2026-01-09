import { useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/web/lib/auth-client";
import { CreateOrganizationDialog } from "./create-organization-dialog";
import { TopbarSwitcher } from "@deco/ui/components/topbar-switcher.tsx";
import { useSidebar } from "@deco/ui/components/sidebar.tsx";
import { Grid01 } from "@untitledui/icons";

export function MeshOrgSwitcher() {
  const { state } = useSidebar();
  const { org } = useParams({ strict: false });
  const { data: organizations } = authClient.useListOrganizations();
  const navigate = useNavigate();

  const currentOrg = organizations?.find(
    (organization) => organization.slug === org,
  );

  const [orgSearch, setOrgSearch] = useState("");
  const [creatingOrganization, setCreatingOrganization] = useState(false);

  const filteredOrganizations = !organizations
    ? []
    : (() => {
        const filtered = organizations.filter((organization) =>
          organization.name.toLowerCase().includes(orgSearch.toLowerCase()),
        );
        // Move currentOrg (by slug) to the front if present
        if (org) {
          const idx = filtered.findIndex((o) => o.slug === org);
          if (idx > 0) {
            const current = filtered[idx];
            if (current) {
              filtered.splice(idx, 1);
              filtered.unshift(current);
            }
          }
        }
        return filtered;
      })();

  // Map Better Auth org shape to generic shape
  const mappedOrgs = filteredOrganizations.map((o) => ({
    slug: o.slug,
    name: o.name,
    avatarUrl: o.logo,
  }));

  const mappedCurrentOrg = currentOrg
    ? {
        slug: currentOrg.slug,
        name: currentOrg.name,
        avatarUrl: currentOrg.logo,
      }
    : undefined;

  const isCollapsed = state === "collapsed";

  return (
    <>
      <TopbarSwitcher collapsed={isCollapsed}>
        <TopbarSwitcher.Trigger
          onClick={() => navigate({ to: "/$org", params: { org: org ?? "" } })}
          collapsed={isCollapsed}
        >
          <TopbarSwitcher.CurrentItem
            item={mappedCurrentOrg}
            collapsed={isCollapsed}
          />
        </TopbarSwitcher.Trigger>

        {!isCollapsed && (
          <TopbarSwitcher.Content>
            <TopbarSwitcher.Panel>
              <TopbarSwitcher.Search
                placeholder="Search organizations..."
                value={orgSearch}
                onChange={setOrgSearch}
              />

              <TopbarSwitcher.Items emptyMessage="No organizations found.">
                {mappedOrgs.map((organization) => (
                  <TopbarSwitcher.Item
                    key={organization.slug}
                    item={organization}
                    onClick={(item) =>
                      navigate({ to: "/$org", params: { org: item.slug } })
                    }
                  />
                ))}
              </TopbarSwitcher.Items>

              <TopbarSwitcher.Actions>
                <TopbarSwitcher.Action
                  onClick={() => setCreatingOrganization(true)}
                  variant="muted"
                >
                  + Create organization
                </TopbarSwitcher.Action>
              </TopbarSwitcher.Actions>

              <TopbarSwitcher.Separator />

              <TopbarSwitcher.Actions>
                <TopbarSwitcher.Action
                  onClick={() => navigate({ to: "/" })}
                  icon={<Grid01 />}
                >
                  See all organizations
                </TopbarSwitcher.Action>
              </TopbarSwitcher.Actions>
            </TopbarSwitcher.Panel>
          </TopbarSwitcher.Content>
        )}
      </TopbarSwitcher>

      <CreateOrganizationDialog
        open={creatingOrganization}
        onOpenChange={setCreatingOrganization}
      />
    </>
  );
}

MeshOrgSwitcher.Skeleton = TopbarSwitcher.Skeleton;
