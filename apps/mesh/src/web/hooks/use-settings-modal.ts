import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

export type SettingsSection =
  | "account.profile"
  | "account.preferences"
  | "account.experimental"
  | "org.general"
  | "org.plugins"
  | `project:${string}:general`
  | `project:${string}:plugins`
  | `project:${string}:danger`;

export function projectSection(
  slug: string,
  sub: "general" | "plugins" | "danger",
): SettingsSection {
  return `project:${slug}:${sub}` as SettingsSection;
}

const STATIC_SECTIONS = new Set([
  "account.profile",
  "account.preferences",
  "account.experimental",
  "org.general",
  "org.plugins",
]);

function isValidSettingsSection(
  value: string | undefined,
): value is SettingsSection {
  if (!value) return false;
  if (STATIC_SECTIONS.has(value)) return true;
  const parts = value.split(":");
  return (
    parts.length === 3 &&
    parts[0] === "project" &&
    !!parts[1] &&
    (parts[2] === "general" || parts[2] === "plugins" || parts[2] === "danger")
  );
}

export function parseProjectSection(section: SettingsSection): {
  slug: string;
  sub: "general" | "plugins" | "danger";
} | null {
  if (!section.startsWith("project:")) return null;
  const [, slug, sub] = section.split(":");
  if (!slug || !sub) return null;
  return { slug, sub: sub as "general" | "plugins" | "danger" };
}

export function useSettingsModal() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { settings?: string };
  const { org, project } = useParams({ strict: false }) as {
    org?: string;
    project?: string;
  };

  const activeSection = isValidSettingsSection(search.settings)
    ? search.settings
    : undefined;
  const isOpen = !!activeSection;

  const open = (section: SettingsSection) => {
    if (!org || !project) return;
    navigate({
      to: "/$org/$project",
      params: { org, project },
      search: { settings: section },
    });
  };

  const close = () => {
    if (!org || !project) return;
    navigate({
      to: "/$org/$project",
      params: { org, project },
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
