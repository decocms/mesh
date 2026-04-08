import { KEYS } from "@/web/lib/query-keys";
import { unwrapToolResult } from "@/web/lib/unwrap-tool-result";
import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@deco/ui/components/card.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Label } from "@deco/ui/components/label.tsx";
import { Switch } from "@deco/ui/components/switch.tsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

interface DomainData {
  domain: string | null;
  autoJoinEnabled: boolean;
}

export function DomainSettings() {
  const { org } = useProjectContext();
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

  const [domainInput, setDomainInput] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const currentDomain = data?.domain ?? null;
  const autoJoinEnabled = data?.autoJoinEnabled ?? false;

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: KEYS.organizationDomain(org.id),
    });

  const setDomainMutation = useMutation({
    mutationFn: async ({
      domain,
      autoJoin,
    }: {
      domain: string;
      autoJoin: boolean;
    }) => {
      const result = await client.callTool({
        name: "ORGANIZATION_DOMAIN_SET",
        arguments: { domain, autoJoinEnabled: autoJoin },
      });
      return unwrapToolResult(result);
    },
    onSuccess: () => {
      invalidate();
      setIsEditing(false);
      setDomainInput("");
      toast.success("Domain updated");
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to update domain",
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
        name: "ORGANIZATION_DOMAIN_SET",
        arguments: { domain: currentDomain, autoJoinEnabled: enabled },
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
        {currentDomain && !isEditing ? (
          <>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">
                  Claimed domain
                </Label>
                <p className="text-sm font-medium">{currentDomain}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDomainInput(currentDomain);
                    setIsEditing(true);
                  }}
                >
                  Change
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => clearDomainMutation.mutate()}
                  disabled={clearDomainMutation.isPending}
                >
                  Remove
                </Button>
              </div>
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
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="domain-input"
                className="text-xs text-muted-foreground"
              >
                {currentDomain ? "New domain" : "Domain"}
              </Label>
              <Input
                id="domain-input"
                placeholder="acme.com"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value.toLowerCase())}
                disabled={setDomainMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Enter your company's email domain (e.g. acme.com)
              </p>
            </div>
          </div>
        )}
      </CardContent>

      {(isEditing || !currentDomain) && domainInput.trim() && (
        <CardFooter className="p-0 pt-2 gap-2">
          <Button
            size="sm"
            onClick={() =>
              setDomainMutation.mutate({
                domain: domainInput.trim(),
                autoJoin: autoJoinEnabled,
              })
            }
            disabled={setDomainMutation.isPending}
          >
            {setDomainMutation.isPending ? "Saving..." : "Save Domain"}
          </Button>
          {isEditing && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setIsEditing(false);
                setDomainInput("");
              }}
            >
              Cancel
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
