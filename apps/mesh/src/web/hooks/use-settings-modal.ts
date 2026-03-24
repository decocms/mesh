import { useNavigate, useMatch, useSearch } from "@tanstack/react-router";

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
  const search = useSearch({ strict: false }) as { settings?: string };
  const orgMatch = useMatch({ from: "/shell/$org", shouldThrow: false });
  const projectMatch = useMatch({
    from: "/shell/$org/projects/$virtualMcpId",
    shouldThrow: false,
  });
  const org = orgMatch?.params.org;
  const virtualMcpId = projectMatch?.params.virtualMcpId;

  const activeSection = isValidSettingsSection(search.settings)
    ? search.settings
    : undefined;
  const isOpen = !!activeSection;

  const open = (section: SettingsSection) => {
    if (!org) return;
    if (virtualMcpId) {
      navigate({
        to: "/$org/projects/$virtualMcpId",
        params: { org, virtualMcpId },
        search: { settings: section },
      });
    } else {
      navigate({
        to: "/$org",
        params: { org },
        search: { settings: section },
      });
    }
  };

  const close = () => {
    if (!org) return;
    if (virtualMcpId) {
      navigate({
        to: "/$org/projects/$virtualMcpId",
        params: { org, virtualMcpId },
        search: {},
      });
    } else {
      navigate({
        to: "/$org",
        params: { org },
        search: {},
      });
    }
  };

  return {
    isOpen,
    activeSection: activeSection ?? ("account.preferences" as SettingsSection),
    open,
    close,
  };
}
