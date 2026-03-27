import { Page } from "@/web/components/page";
import { OrganizationForm } from "@/web/components/settings/organization-form";

export function OrgGeneralPage() {
  return (
    <Page>
      <Page.Content>
        <Page.Body>
          <div className="flex flex-col gap-6">
            <Page.Title>Organization</Page.Title>
            <OrganizationForm />
          </div>
        </Page.Body>
      </Page.Content>
    </Page>
  );
}
