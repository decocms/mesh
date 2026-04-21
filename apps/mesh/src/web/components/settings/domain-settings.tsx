import { authClient } from "@/web/lib/auth-client";
import { KEYS } from "@/web/lib/query-keys";
import { unwrapToolResult } from "@/web/lib/unwrap-tool-result";
import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { Button } from "@decocms/ui/components/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@decocms/ui/components/card.tsx";
import { Label } from "@decocms/ui/components/label.tsx";
import { Switch } from "@decocms/ui/components/switch.tsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface DomainData {
  domain: string | null;
  autoJoinEnabled: boolean;
}

export function DomainSettings() {
  const { org } = useProjectContext();
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const { data, isPending } = useQuery<DomainData>({
    queryKey: KEYS.organizationDomain(org.id),
    queryFn: async () => {
      const result = await client.callTool({
        name: "ORGANIZATION_DOMAIN_GET",
        arguments: {},
      });
      return unwrapToolResult<DomainData>(result);
    },
  });

  const userEmail = session?.user?.email ?? "";
  const userDomain = userEmail.split("@")[1]?.toLowerCase() ?? "";
  const currentDomain = data?.domain ?? null;
  const autoJoinEnabled = data?.autoJoinEnabled ?? false;
  const canClaim = userDomain && userDomain !== currentDomain;

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: KEYS.organizationDomain(org.id),
    });

  const setDomainMutation = useMutation({
    mutationFn: async () => {
      const result = await client.callTool({
        name: "ORGANIZATION_DOMAIN_SET",
        arguments: { domain: userDomain, autoJoinEnabled: false },
      });
      return unwrapToolResult(result);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Domain claimed");
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to claim domain",
      );
    },
  });

  const clearDomainMutation = useMutation({
    mutationFn: async () => {
      const result = await client.callTool({
        name: "ORGANIZATION_DOMAIN_CLEAR",
        arguments: {},
      });
      return unwrapToolResult(result);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Domain removed");
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to remove domain",
      );
    },
  });

  const toggleAutoJoinMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!currentDomain) return;
      const result = await client.callTool({
        name: "ORGANIZATION_DOMAIN_UPDATE",
        arguments: { autoJoinEnabled: enabled },
      });
      return unwrapToolResult(result);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Auto-join setting updated");
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to update auto-join",
      );
    },
  });

  if (isPending) {
    return null;
  }

  return (
    <Card className="p-6">
      <CardHeader className="p-0">
        <CardTitle className="text-sm">Email Domain</CardTitle>
        <CardDescription className="text-xs">
          Claim your company's email domain so new users with matching emails
          can automatically join this organization.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 p-0 pt-4">
        {currentDomain ? (
          <>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">
                  Claimed domain
                </Label>
                <p className="text-sm font-medium">{currentDomain}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => clearDomainMutation.mutate()}
                disabled={clearDomainMutation.isPending}
              >
                Remove
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs">Auto-join</Label>
                <p className="text-xs text-muted-foreground">
                  Users with @{currentDomain} emails will automatically join
                  this organization on signup.
                </p>
              </div>
              <Switch
                checked={autoJoinEnabled}
                onCheckedChange={(checked) =>
                  toggleAutoJoinMutation.mutate(checked)
                }
                disabled={toggleAutoJoinMutation.isPending}
              />
            </div>
          </>
        ) : canClaim ? (
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">
                Your domain
              </Label>
              <p className="text-sm font-medium">{userDomain}</p>
            </div>
            <Button
              size="sm"
              onClick={() => setDomainMutation.mutate()}
              disabled={setDomainMutation.isPending}
            >
              {setDomainMutation.isPending ? "Claiming..." : "Claim Domain"}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No corporate email domain detected.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
