import { Page } from "@/web/components/page";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@deco/ui/components/breadcrumb.tsx";
import { Switch } from "@deco/ui/components/switch.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@deco/ui/components/select.tsx";
import {
  Bell01,
  Code01,
  Monitor01,
  Moon01,
  Shield01,
  Sun,
} from "@untitledui/icons";
import { usePreferences, type ThemeMode } from "@/web/hooks/use-preferences.ts";
import { toast } from "@deco/ui/components/sonner.js";

function SettingRow({
  icon,
  label,
  description,
  control,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  control: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between gap-6 py-4 border-b border-border last:border-0"
      onClick={disabled ? undefined : onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      onKeyDown={
        onClick && !disabled
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{ cursor: onClick && !disabled ? "pointer" : undefined }}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {description}
          </p>
        </div>
      </div>
      <div onClick={(e) => e.stopPropagation()} className="shrink-0">
        {control}
      </div>
    </div>
  );
}

export function AccountPreferencesPage() {
  const [preferences, setPreferences] = usePreferences();

  const handleNotificationsChange = async (checked: boolean) => {
    if (checked) {
      const result = await Notification.requestPermission();
      if (result !== "granted") {
        toast.error(
          "Notifications denied. Please enable them in your browser settings.",
        );
        setPreferences((prev) => ({ ...prev, enableNotifications: false }));
        return;
      }
    }
    setPreferences((prev) => ({ ...prev, enableNotifications: checked }));
  };

  return (
    <Page>
      <Page.Header hideSidebarTrigger>
        <Page.Header.Left>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Preferences</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Page.Header.Left>
      </Page.Header>
      <Page.Content>
        <div className="flex flex-col">
          <SettingRow
            icon={<Sun size={16} />}
            label="Theme"
            description="Choose between light, dark, or system theme."
            control={
              <Select
                value={preferences.theme}
                onValueChange={(value) =>
                  setPreferences((prev) => ({
                    ...prev,
                    theme: value as ThemeMode,
                  }))
                }
              >
                <SelectTrigger className="w-36">
                  <span>
                    {
                      { light: "Light", dark: "Dark", system: "System" }[
                        preferences.theme
                      ]
                    }
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light" textValue="Light">
                    <div className="flex items-center gap-2">
                      <Sun size={14} />
                      <span>Light</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="dark" textValue="Dark">
                    <div className="flex items-center gap-2">
                      <Moon01 size={14} />
                      <span>Dark</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="system" textValue="System">
                    <div className="flex items-center gap-2">
                      <Monitor01 size={14} />
                      <span>System</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingRow
            icon={<Code01 size={16} />}
            label="Developer Mode"
            description="Show technical details like JSON input/output for tool calls."
            onClick={() =>
              setPreferences((prev) => ({ ...prev, devMode: !prev.devMode }))
            }
            control={
              <Switch
                checked={preferences.devMode}
                onCheckedChange={(checked) =>
                  setPreferences((prev) => ({ ...prev, devMode: checked }))
                }
              />
            }
          />
          <SettingRow
            icon={<Bell01 size={16} />}
            label="Notifications"
            description="Play a sound and show a notification when chat messages complete while the app is unfocused."
            disabled={typeof Notification === "undefined"}
            onClick={() =>
              handleNotificationsChange(!preferences.enableNotifications)
            }
            control={
              <Switch
                disabled={typeof Notification === "undefined"}
                checked={preferences.enableNotifications}
                onCheckedChange={handleNotificationsChange}
              />
            }
          />
          <SettingRow
            icon={<Shield01 size={16} />}
            label="Tool Approval"
            description="Choose when to require approval before tools execute."
            control={
              <Select
                value={preferences.toolApprovalLevel}
                onValueChange={(value) =>
                  setPreferences((prev) => ({
                    ...prev,
                    toolApprovalLevel: value as "auto" | "readonly" | "plan",
                  }))
                }
              >
                <SelectTrigger className="w-36">
                  <span>
                    {
                      {
                        readonly: "Skip read-only",
                        auto: "Auto-approve all",
                        plan: "Plan mode",
                      }[preferences.toolApprovalLevel]
                    }
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="readonly" textValue="Skip read-only">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">Skip read-only</span>
                      <span className="text-xs text-muted-foreground">
                        Auto-approve read-only tools, ask for others
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="auto" textValue="Auto-approve all">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">Auto-approve all</span>
                      <span className="text-xs text-muted-foreground">
                        Execute all tools without approval
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="plan" textValue="Plan mode">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">Plan mode</span>
                      <span className="text-xs text-muted-foreground">
                        Read-only exploration, then propose a plan
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            }
          />
        </div>
      </Page.Content>
    </Page>
  );
}
