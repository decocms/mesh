import { OrgSsoPage } from "@/web/views/settings/org-sso";
import { SettingsPermissionGuard } from "@/web/components/settings-permission-guard";

export default function SsoRoute() {
  return (
    <SettingsPermissionGuard requiredTool="__admin_only__">
      <OrgSsoPage />
    </SettingsPermissionGuard>
  );
}
