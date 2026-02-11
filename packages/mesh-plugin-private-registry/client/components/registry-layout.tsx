import { useState, type ComponentType } from "react";
import { Button } from "@deco/ui/components/button.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  Container,
  FlipBackward,
  Loading01,
  Save01,
  Settings01,
} from "@untitledui/icons";
import { PLUGIN_ID } from "../../shared";
import { useRegistryConfig } from "../hooks/use-registry";
import RegistryItemsPage from "./registry-items-page";
import RegistrySettingsPage from "./registry-settings-page";

type NavItem = {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  tab: "items" | "settings";
};

function HeaderTabs({
  activeTab,
  onChange,
  items,
}: {
  activeTab: NavItem["tab"];
  onChange: (tab: NavItem["tab"]) => void;
  items: NavItem[];
}) {
  return (
    <nav className="flex items-center gap-2 overflow-x-auto no-scrollbar">
      {items.map((item) => {
        const active = activeTab === item.tab;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            className={cn(
              "h-7 px-2 text-sm rounded-lg border border-input transition-colors inline-flex gap-1.5 items-center whitespace-nowrap",
              active
                ? "bg-accent border-border text-foreground"
                : "bg-transparent text-muted-foreground hover:border-border hover:bg-accent/50 hover:text-foreground",
            )}
            onClick={() => onChange(item.tab)}
          >
            <Icon size={14} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default function RegistryLayout() {
  const [activeTab, setActiveTab] = useState<NavItem["tab"]>("items");
  const { registryName, registryIcon } = useRegistryConfig(PLUGIN_ID);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsIsSaving, setSettingsIsSaving] = useState(false);
  const [settingsOnSave, setSettingsOnSave] = useState<
    (() => void | Promise<void>) | null
  >(null);
  const [settingsOnUndo, setSettingsOnUndo] = useState<(() => void) | null>(
    null,
  );

  const navItems: NavItem[] = [
    { id: "items", label: "Items", icon: Container, tab: "items" },
    { id: "settings", label: "Settings", icon: Settings01, tab: "settings" },
  ];

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <header className="shrink-0 w-full border-b border-border h-12 overflow-x-auto flex items-center justify-between gap-3 px-4 min-w-max">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            className="min-w-0 flex items-center gap-2 hover:opacity-90 transition-opacity cursor-pointer"
            onClick={() => setActiveTab("settings")}
          >
            <div className="size-7 rounded-lg border border-border overflow-hidden bg-muted/20 flex items-center justify-center shrink-0">
              {registryIcon ? (
                <img
                  src={registryIcon}
                  alt={registryName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-[10px] font-semibold text-muted-foreground">
                  {registryName.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <span className="text-sm font-medium truncate max-w-[220px]">
              {registryName}
            </span>
          </button>
          <div className="h-6 w-px bg-border shrink-0" />
          <HeaderTabs
            activeTab={activeTab}
            onChange={setActiveTab}
            items={navItems}
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {activeTab === "settings" && settingsOnSave && settingsOnUndo && (
            <>
              {settingsDirty && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={settingsOnUndo}
                  disabled={settingsIsSaving}
                >
                  <FlipBackward size={14} />
                  Undo
                </Button>
              )}
              <Button
                variant="default"
                size="sm"
                onClick={settingsOnSave}
                disabled={settingsIsSaving || !settingsDirty}
              >
                {settingsIsSaving ? (
                  <Loading01 size={14} className="animate-spin" />
                ) : (
                  <Save01 size={14} />
                )}
                Save
              </Button>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 min-w-0 overflow-hidden">
        {activeTab === "items" && <RegistryItemsPage />}
        {activeTab === "settings" && (
          <RegistrySettingsPage
            onDirtyChange={setSettingsDirty}
            onSavingChange={setSettingsIsSaving}
            registerSave={(handler) => {
              if (!handler) {
                setSettingsOnSave(null);
                return;
              }
              setSettingsOnSave(() => handler);
            }}
            registerUndo={(handler) => {
              if (!handler) {
                setSettingsOnUndo(null);
                return;
              }
              setSettingsOnUndo(() => handler);
            }}
          />
        )}
      </main>
    </div>
  );
}
