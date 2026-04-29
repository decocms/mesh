import { OrgBrandContextPage } from "@/web/views/settings/org-brand-context";
import { SettingsPermissionGuard } from "@/web/components/settings-permission-guard";

export default function BrandContextRoute() {
  return (
    <SettingsPermissionGuard requiredTool="BRAND_CONTEXT_LIST">
      <OrgBrandContextPage />
    </SettingsPermissionGuard>
  );
}
