import { DangerZone } from "@/web/components/settings/danger-zone";

export function ProjectDangerPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Danger Zone</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Irreversible and destructive actions.
        </p>
      </div>
      <DangerZone />
    </div>
  );
}
