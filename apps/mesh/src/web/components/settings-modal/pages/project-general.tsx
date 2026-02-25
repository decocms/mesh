import { ProjectGeneralForm } from "@/web/components/settings/project-general-form";

export function ProjectGeneralPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">General</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Basic project information.
        </p>
      </div>
      <ProjectGeneralForm />
    </div>
  );
}
