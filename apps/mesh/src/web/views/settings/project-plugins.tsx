import { Page } from "@/web/components/page";
import { ProjectPluginsForm } from "@/web/components/settings/project-plugins-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deco/ui/components/card.tsx";

export function ProjectPluginsPage() {
  return (
    <Page>
      <Page.Content>
        <Page.Body>
          <div className="flex flex-col gap-6">
            <Page.Title>Features</Page.Title>
            <Card className="hover:bg-card p-6">
              <CardHeader className="p-0">
                <CardTitle className="text-sm">Plugins</CardTitle>
                <CardDescription>
                  Extend your project with built-in capabilities that activate
                  automatically on any connection that supports them.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ProjectPluginsForm />
              </CardContent>
            </Card>
          </div>
        </Page.Body>
      </Page.Content>
    </Page>
  );
}
