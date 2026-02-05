import { EmptyState } from "@/web/components/empty-state.tsx";
import { Page } from "@/web/components/page";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@deco/ui/components/breadcrumb.tsx";
import { CheckDone01 } from "@untitledui/icons";

export default function TasksPage() {
  return (
    <Page>
      <Page.Header>
        <Page.Header.Left>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Tasks</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Page.Header.Left>
      </Page.Header>

      <Page.Content className="flex">
        <EmptyState
          image={
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted">
              <CheckDone01 size={32} className="text-muted-foreground" />
            </div>
          }
          title="Tasks"
          description="Manage agent tasks and track progress on project goals. Coming soon."
        />
      </Page.Content>
    </Page>
  );
}
