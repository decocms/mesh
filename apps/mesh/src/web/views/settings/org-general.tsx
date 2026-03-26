import { Page } from "@/web/components/page";
import { OrganizationForm } from "@/web/components/settings/organization-form";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@deco/ui/components/breadcrumb.tsx";

export function OrgGeneralPage() {
  return (
    <Page>
      <Page.Header hideSidebarTrigger>
        <Page.Header.Left>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Organization</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Page.Header.Left>
      </Page.Header>
      <Page.Content>
        <OrganizationForm />
      </Page.Content>
    </Page>
  );
}
