import MembersPage from "@/web/routes/orgs/members";
import { SettingsPermissionGuard } from "@/web/components/settings-permission-guard";

export default function SettingsMembersRoute() {
  return (
    <SettingsPermissionGuard requiredTool="ORGANIZATION_MEMBER_LIST">
      <MembersPage />
    </SettingsPermissionGuard>
  );
}
