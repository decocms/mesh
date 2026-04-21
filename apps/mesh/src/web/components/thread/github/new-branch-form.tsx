import { useState } from "react";
import { toast } from "sonner";
import { useMCPClient, useMCPToolCallMutation } from "@decocms/mesh-sdk";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { Label } from "@deco/ui/components/label.tsx";

interface Props {
  orgId: string;
  connectionId: string;
  owner: string;
  repo: string;
  defaultBase: string | null;
  onBack: () => void;
  onCreated: (branch: string) => void;
}

export function NewBranchForm({
  orgId,
  connectionId,
  owner,
  repo,
  defaultBase,
  onBack,
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [base, setBase] = useState(defaultBase ?? "main");

  const client = useMCPClient({ connectionId, orgId });
  const createBranch = useMCPToolCallMutation({
    client,
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to create branch",
      );
    },
  });

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Branch name is required");
      return;
    }
    await createBranch
      .mutateAsync({
        name: "create_branch",
        arguments: { owner, repo, branch: trimmed, from_branch: base },
      })
      .then(() => {
        toast.success(`Branch "${trimmed}" created`);
        onCreated(trimmed);
      })
      .catch(() => {
        // onError already reported
      });
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="grid gap-1.5">
        <Label htmlFor="new-branch-name">Name</Label>
        <Input
          id="new-branch-name"
          value={name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setName(e.target.value)
          }
          placeholder="feat/my-change"
          autoFocus
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="new-branch-base">Base</Label>
        <Input
          id="new-branch-base"
          value={base}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setBase(e.target.value)
          }
          placeholder={defaultBase ?? "main"}
        />
      </div>
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Back
        </Button>
        <Button size="sm" onClick={submit} disabled={createBranch.isPending}>
          {createBranch.isPending ? "Creating…" : "Create"}
        </Button>
      </div>
    </div>
  );
}
