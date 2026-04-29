import { OrgAiProvidersPage } from "@/web/views/settings/org-ai-providers";
import { SettingsPermissionGuard } from "@/web/components/settings-permission-guard";

export default function AiProvidersRoute() {
  return (
    <SettingsPermissionGuard requiredTool="AI_PROVIDERS_LIST">
      <OrgAiProvidersPage />
    </SettingsPermissionGuard>
  );
}
