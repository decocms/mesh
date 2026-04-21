/**
 * EnvVarsEditor
 *
 * Key/value editor for a thread's sandbox env vars. Values live in the
 * server-side vault — the editor only ever sees plaintext for rows the user
 * typed or replaced during the current session. Existing values come back as
 * `{ hasValue: true }` and are represented with a masked placeholder; the
 * user replaces them by typing a new value.
 *
 * Changes are applied on the next container provision. The parent component
 * surfaces the "restart required" UX.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMCPClient, SELF_MCP_ALIAS_ID } from "@decocms/mesh-sdk";
import { Plus, Trash01, Loading01 } from "@untitledui/icons";
import { Button } from "@deco/ui/components/button.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { toast } from "sonner";

interface Row {
  key: string;
  value: string;
  /** True for rows that had a value on load. Value is masked until edited. */
  hadValue: boolean;
  /** User typed a new value (or edited the key). */
  dirty: boolean;
  /** Marked for deletion — applied on save. */
  deleted: boolean;
  /** Row added in this session (not yet persisted). */
  isNew: boolean;
}

interface KeyEntry {
  key: string;
  updatedAt: string;
}

const MASKED = "••••••••";

interface EnvVarsEditorProps {
  threadId: string;
  orgId: string;
  /** Called after a successful save. Parent decides whether to prompt restart. */
  onSaved?: (hasChanges: boolean) => void;
}

export function EnvVarsEditor({
  threadId,
  orgId,
  onSaved,
}: EnvVarsEditorProps) {
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId,
  });
  const queryClient = useQueryClient();
  const queryKey = ["sandbox-env", threadId];

  const { data, isLoading } = useQuery<KeyEntry[]>({
    queryKey,
    enabled: !!threadId,
    queryFn: async () => {
      const result = await client.callTool({
        name: "SANDBOX_ENV_LIST",
        arguments: { threadId },
      });
      const structured = (
        result as { structuredContent?: { keys: KeyEntry[] } }
      ).structuredContent;
      return structured?.keys ?? [];
    },
  });

  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);

  const current: Row[] =
    rows ??
    (data
      ? data.map<Row>((entry) => ({
          key: entry.key,
          value: "",
          hadValue: true,
          dirty: false,
          deleted: false,
          isNew: false,
        }))
      : []);

  const updateRow = (index: number, patch: Partial<Row>) => {
    setRows((prev) => {
      const base = prev ?? current;
      const existing = base[index];
      if (!existing) return base;
      const next = base.slice();
      next[index] = { ...existing, ...patch };
      return next;
    });
  };

  const addRow = () =>
    setRows((prev) => [
      ...(prev ?? current),
      {
        key: "",
        value: "",
        hadValue: false,
        dirty: true,
        deleted: false,
        isNew: true,
      },
    ]);

  const removeRow = (index: number) => {
    setRows((prev) => {
      const base = prev ?? current;
      const row = base[index];
      if (!row) return base;
      // New rows can just disappear; persisted rows are tombstoned until save.
      if (row.isNew) return base.filter((_, i) => i !== index);
      const next = base.slice();
      next[index] = { ...row, deleted: !row.deleted };
      return next;
    });
  };

  const hasChanges = (rows ?? []).some(
    (r) => r.deleted || (r.dirty && r.key.length > 0),
  );

  const handleSave = async () => {
    if (!hasChanges || saving) return;
    setSaving(true);
    try {
      const entries = (rows ?? [])
        .filter((r) => !r.deleted && r.dirty && r.key.length > 0)
        .map((r) => ({ key: r.key, value: r.value }));
      const deletions = (rows ?? [])
        .filter((r) => r.deleted && !r.isNew && r.key.length > 0)
        .map((r) => r.key);

      if (entries.length > 0) {
        await client.callTool({
          name: "SANDBOX_ENV_SET",
          arguments: { threadId, entries },
        });
      }
      if (deletions.length > 0) {
        await client.callTool({
          name: "SANDBOX_ENV_DELETE",
          arguments: { threadId, keys: deletions },
        });
      }

      await queryClient.invalidateQueries({ queryKey });
      setRows(null);
      toast.success("Env vars saved");
      onSaved?.(entries.length > 0 || deletions.length > 0);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save env vars",
      );
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loading01 size={12} className="animate-spin" />
        Loading env vars...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Environment variables</span>
        <button
          type="button"
          onClick={addRow}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <Plus size={12} />
          Add
        </button>
      </div>

      {current.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No env vars set. Click "Add" to create one.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {current.map((row, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input
                placeholder="KEY"
                className="h-7 text-xs font-mono flex-1 min-w-0"
                value={row.key}
                disabled={row.deleted || (row.hadValue && !row.isNew)}
                onChange={(e) =>
                  updateRow(i, { key: e.target.value, dirty: true })
                }
              />
              <Input
                type="password"
                placeholder={row.hadValue ? MASKED : "value"}
                className="h-7 text-xs font-mono flex-1 min-w-0"
                value={row.value}
                disabled={row.deleted}
                onChange={(e) =>
                  updateRow(i, { value: e.target.value, dirty: true })
                }
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                className={cn(
                  "shrink-0 p-1 rounded transition-colors",
                  row.deleted
                    ? "text-destructive"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title={row.deleted ? "Undo delete" : "Delete"}
              >
                <Trash01 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {hasChanges && (
        <Button
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={handleSave}
          className="self-start"
        >
          {saving ? <Loading01 size={12} className="animate-spin" /> : null}
          {saving ? "Saving..." : "Save"}
        </Button>
      )}
    </div>
  );
}
