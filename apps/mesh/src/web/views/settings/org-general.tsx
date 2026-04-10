import { Page } from "@/web/components/page";
import { OrganizationForm } from "@/web/components/settings/organization-form";
import { DomainSettings } from "@/web/components/settings/domain-settings";

export function OrgGeneralPage() {
  return (
    <Page>
      <Page.Content>
        <Page.Body>
          <div className="flex flex-col gap-6">
            <Page.Title>Organization</Page.Title>
            <OrganizationForm />
            <DomainSettings />
          </div>
        </Page.Body>
      </Page.Content>
    </Page>
  );
}
