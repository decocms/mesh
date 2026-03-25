import { Page } from "@/web/components/page";
import { ProjectPluginsForm } from "@/web/components/settings/project-plugins-form";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@deco/ui/components/breadcrumb.tsx";

export function ProjectPluginsPage() {
  return (
    <Page>
      <Page.Header hideSidebarTrigger>
        <Page.Header.Left>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Features</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Page.Header.Left>
      </Page.Header>
      <Page.Content className="p-5 sm:p-8">
        <div className="flex flex-col gap-6">
          <p className="text-sm text-muted-foreground">
            Extend your project with built-in capabilities that activate
            automatically on any connection that supports them.
          </p>
          <ProjectPluginsForm />
        </div>
      </Page.Content>
    </Page>
  );
}
