import { useNavigate, useLocation, useSearch } from "@tanstack/react-router";

export type SettingsSection =
  | "account.profile"
  | "account.preferences"
  | "org.general"
  | "org.plugins"
  | "org.ai-providers"
  | "org.billing"
  | "org.members"
  | "org.sso";

const VALID_SECTIONS = new Set<string>([
  "account.profile",
  "account.preferences",
  "org.general",
  "org.plugins",
  "org.ai-providers",
  "org.billing",
  "org.members",
  "org.sso",
]);

function isValidSettingsSection(
  value: string | undefined,
): value is SettingsSection {
  if (!value) return false;
  return VALID_SECTIONS.has(value);
}

export function useSettingsModal() {
  const navigate = useNavigate();
  const location = useLocation();
  const search = useSearch({ strict: false }) as { settings?: string };

  const activeSection = isValidSettingsSection(search.settings)
    ? search.settings
    : undefined;
  const isOpen = !!activeSection;

  const open = (section: SettingsSection) => {
    navigate({
      to: location.pathname,
      search: { settings: section },
    });
  };

  const close = () => {
    navigate({
      to: location.pathname,
      search: {},
    });
  };

  return {
    isOpen,
    activeSection: activeSection ?? ("account.preferences" as SettingsSection),
    open,
    close,
  };
}
