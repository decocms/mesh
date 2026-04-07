import { Page } from "@/web/components/page";
import { ProjectPluginsForm } from "@/web/components/settings/project-plugins-form";

export function ProjectPluginsPage() {
  return (
    <Page>
      <Page.Content>
        <Page.Body>
          <div className="flex flex-col gap-6">
            <Page.Title>Plugins</Page.Title>
            <ProjectPluginsForm />
          </div>
        </Page.Body>
      </Page.Content>
    </Page>
  );
}
