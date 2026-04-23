import { useProjectContext } from "@decocms/mesh-sdk";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@deco/ui/components/tabs.tsx";
import { ChangesTab } from "./changes-tab.tsx";
import { ChecksTab } from "./checks-tab.tsx";
import { DescriptionTab } from "./description-tab.tsx";
import { usePrFiles, type PrSummary } from "./use-pr-data.ts";

interface Props {
  pr: PrSummary;
  connectionId: string;
  owner: string;
  repo: string;
}

/**
 * Sub-tab container for State C (PR open). Description | Changes {n}
 * | Checks. Each sub-tab owns its data fetch via the hooks in
 * use-pr-data.ts; this wrapper only handles layout + tab state.
 *
 * We call `usePrFiles` here (not only inside ChangesTab) so the tab
 * label can show the file count even before the user opens the tab.
 * React Query dedupes the call when ChangesTab mounts.
 */
export function PrSubTabs({ pr, connectionId, owner, repo }: Props) {
  const { org } = useProjectContext();
  const filesQuery = usePrFiles({
    orgId: org.id,
    connectionId,
    owner,
    repo,
    prNumber: pr.number,
  });
  const fileCount = filesQuery.data?.length;

  return (
    <Tabs
      defaultValue="description"
      variant="underline"
      className="flex min-h-0 flex-1 flex-col"
    >
      <TabsList variant="underline" className="h-12 px-2">
        <TabsTrigger variant="underline" value="description">
          Description
        </TabsTrigger>
        <TabsTrigger variant="underline" value="changes">
          Changes{fileCount !== undefined ? ` ${fileCount}` : ""}
        </TabsTrigger>
        <TabsTrigger variant="underline" value="checks">
          Checks
        </TabsTrigger>
      </TabsList>
      <TabsContent value="description" className="flex-1 overflow-auto">
        <DescriptionTab
          pr={pr}
          connectionId={connectionId}
          owner={owner}
          repo={repo}
        />
      </TabsContent>
      <TabsContent value="changes" className="flex-1 overflow-auto">
        <ChangesTab
          pr={pr}
          connectionId={connectionId}
          owner={owner}
          repo={repo}
        />
      </TabsContent>
      <TabsContent value="checks" className="flex-1 overflow-auto">
        <ChecksTab
          pr={pr}
          connectionId={connectionId}
          owner={owner}
          repo={repo}
        />
      </TabsContent>
    </Tabs>
  );
}
