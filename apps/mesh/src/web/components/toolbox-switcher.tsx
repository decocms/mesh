/**
 * Toolbox Switcher
 *
 * Dropdown to switch between toolboxes within the current organization.
 * Similar to OrgSwitcher but for toolboxes.
 */

import { useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useGateways } from "@/web/hooks/collections/use-gateway";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { useToolboxContext } from "@/web/providers/toolbox-context-provider";
import { TopbarSwitcher } from "@deco/ui/components/topbar-switcher.tsx";
import { Plus } from "@untitledui/icons";

export function ToolboxSwitcher() {
  const { org } = useProjectContext();
  const { toolbox } = useToolboxContext();
  const { toolboxId } = useParams({ strict: false });
  const gateways = useGateways();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");

  const filteredGateways = gateways.filter((gateway) =>
    gateway.title.toLowerCase().includes(search.toLowerCase()),
  );

  // Map gateways to switcher shape
  const mappedGateways = filteredGateways.map((g) => ({
    slug: g.id,
    name: g.title,
    avatarUrl: g.icon,
  }));

  const mappedCurrentToolbox = toolbox
    ? {
        slug: toolbox.id,
        name: toolbox.title,
        avatarUrl: toolbox.icon,
      }
    : undefined;

  return (
    <TopbarSwitcher>
      <TopbarSwitcher.Trigger
        onClick={() =>
          navigate({
            to: "/$org/toolbox/$toolboxId",
            params: { org: org.slug, toolboxId: toolboxId ?? "" },
          })
        }
      >
        <TopbarSwitcher.CurrentItem item={mappedCurrentToolbox} />
      </TopbarSwitcher.Trigger>

      <TopbarSwitcher.Content>
        <TopbarSwitcher.Panel>
          <TopbarSwitcher.Search
            placeholder="Search toolboxes..."
            value={search}
            onChange={setSearch}
          />

          <TopbarSwitcher.Items emptyMessage="No toolboxes found.">
            {mappedGateways.map((gateway) => (
              <TopbarSwitcher.Item
                key={gateway.slug}
                item={gateway}
                onClick={(item) =>
                  navigate({
                    to: "/$org/toolbox/$toolboxId",
                    params: { org: org.slug, toolboxId: item.slug },
                  })
                }
              />
            ))}
          </TopbarSwitcher.Items>

          <TopbarSwitcher.Separator />

          <TopbarSwitcher.Actions>
            <TopbarSwitcher.Action
              onClick={() =>
                navigate({ to: "/$org/toolbox", params: { org: org.slug } })
              }
              icon={<Plus size={16} />}
            >
              Create new toolbox
            </TopbarSwitcher.Action>
          </TopbarSwitcher.Actions>
        </TopbarSwitcher.Panel>
      </TopbarSwitcher.Content>
    </TopbarSwitcher>
  );
}

ToolboxSwitcher.Skeleton = TopbarSwitcher.Skeleton;
