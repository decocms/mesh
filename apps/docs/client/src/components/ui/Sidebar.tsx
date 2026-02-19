import React, { useEffect, useState } from "react";
import { navigate } from "astro:transitions/client";
import { Logo } from "../../components/atoms/Logo";
import { Icon } from "../../components/atoms/Icon";
import { Select } from "../../components/atoms/Select";
import { LanguageSelector } from "./LanguageSelector";
import { ThemeToggle } from "./ThemeToggle";

// GitHub Stars Component
function GitHubStars() {
  const [stars, setStars] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStars = async () => {
      try {
        const response = await fetch(
          "https://api.github.com/repos/decocms/mesh",
        );
        if (response.ok) {
          const data = await response.json();
          setStars(data.stargazers_count);
        }
      } catch (error) {
        console.error("Failed to fetch GitHub stars:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStars();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-1 text-star">
        <Icon name="Star" size={14} />
        <span className="text-xs">...</span>
      </div>
    );
  }

  if (stars === null) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 text-star">
      <Icon name="Star" size={14} />
      <span className="text-xs">{stars.toLocaleString()}</span>
    </div>
  );
}

// Version Selector Component
function VersionSelector({
  currentVersion: initialVersion,
  onVersionChange,
  inline = false,
}: {
  currentVersion: string;
  onVersionChange: (version: string) => void;
  inline?: boolean;
}) {
  // Read version from URL dynamically on client side
  const [currentVersion, setCurrentVersion] = useState(initialVersion);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const version = params.get("version") || "latest";
      setCurrentVersion(version);
      onVersionChange(version);
    };

    // Listen for URL changes (for browser back/forward)
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only setup listener once

  const versions = [
    {
      id: "latest",
      label: "Latest (Stable)",
      shortLabel: "Stable",
      description: "Current production docs",
    },
    {
      id: "draft",
      label: "Draft",
      shortLabel: "Draft",
      description: "In-progress documentation",
    },
  ];

  const handleVersionChange = (newVersion: string) => {
    if (newVersion === currentVersion) return;

    setCurrentVersion(newVersion);
    onVersionChange(newVersion);
  };

  if (inline) {
    return (
      <div className="relative">
        <select
          value={currentVersion}
          onChange={(e) => handleVersionChange(e.target.value)}
          className="h-8 pl-2 pr-6 text-xs bg-transparent border border-border rounded-md text-muted-foreground appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.shortLabel}
            </option>
          ))}
        </select>
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <Icon
            name="ChevronDown"
            size={12}
            className="text-muted-foreground"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-3">
      <label className="block text-xs font-medium text-muted mb-1.5">
        Documentation Version
      </label>
      <Select
        options={versions.map((v) => ({ value: v.id, label: v.label }))}
        value={currentVersion}
        icon="BookOpen"
        onChange={(e) => handleVersionChange(e.target.value)}
      />
      <p className="text-xs text-muted mt-1">
        {versions.find((v) => v.id === currentVersion)?.description}
      </p>
    </div>
  );
}

interface DocData {
  title?: string;
  icon?: string;
  [key: string]: unknown;
}

interface Doc {
  id?: string;
  data?: DocData;
  [key: string]: unknown;
}

interface FlatNode {
  name: string;
  type: "file" | "folder";
  doc?: Doc;
  path: string[];
  depth: number;
  id: string;
  hasChildren: boolean;
}

interface SidebarProps {
  tree: FlatNode[];
  locale: string;
  translations: Record<string, string>;
  currentVersion: string;
}

interface TreeItemProps {
  node: FlatNode;
  isVisible: boolean;
  isExpanded: boolean;
  onToggle: (folderId: string) => void;
  locale: string;
  translations: Record<string, string>;
  version: string;
}

function TreeItem({
  node,
  isVisible,
  isExpanded,
  onToggle,
  locale,
  translations,
  version,
}: TreeItemProps) {
  if (!isVisible) return null;

  // Active state: start false (matches server), update after hydration
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (node.type !== "file") return;
    if (typeof window === "undefined") return;

    const currentPath = window.location.pathname;
    const docId = node.doc?.id;
    // docId is now version/locale/path, skip first 2 parts
    const docPath = docId ? docId.split("/").slice(2).join("/") : null;
    const itemPath = `/${version}/${locale}/${docPath ?? node.path.join("/")}`;

    setActive(currentPath === itemPath);
  }, [node.type, node.doc?.id, node.path, locale, version]);

  const docId = node.doc?.id;
  // docId is now version/locale/path, skip first 2 parts
  const docPath = docId ? docId.split("/").slice(2).join("/") : null;

  // Build href with version prefix
  const href =
    node.type === "file"
      ? `/${version}/${locale}/${docPath ?? node.path.join("/")}`
      : null;

  // A node should be collapsible if it has children, regardless of whether it's a file or folder
  const isCollapsible = node.hasChildren;
  const isFolder = node.type === "folder";

  // Shared icon rendering logic
  const renderIcon = () => {
    if (isFolder || (isCollapsible && !node.doc?.data?.icon)) {
      return (
        <Icon
          name={
            node.id === "mcp-mesh/self-hosting"
              ? "Database"
              : node.id === "mcp-mesh/self-hosting/deploy"
                ? "Rocket"
                : node.id === "mcp-mesh/decopilot"
                  ? "Cpu"
                  : "Folder"
          }
          size={16}
          className={`shrink-0 ${active ? "text-primary" : ""}`}
        />
      );
    }
    if (node.doc?.data?.icon) {
      return (
        <Icon
          name={node.doc.data.icon}
          size={16}
          className={`shrink-0 ${active ? "text-primary" : ""}`}
        />
      );
    }
    return (
      <Icon
        name="FileText"
        size={16}
        className={`shrink-0 ${active ? "text-primary" : ""}`}
      />
    );
  };

  const sharedClasses = `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
    active
      ? "bg-primary/5 text-primary" // Active state
      : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;

  return (
    <li>
      {isCollapsible ? (
        <div className={`${sharedClasses} cursor-pointer`}>
          {/* Indentation spacer for nested items */}
          {node.depth > 0 && (
            <div
              className="shrink-0"
              style={{ width: `${node.depth * 24}px` }}
            />
          )}

          {/* Icon */}
          {renderIcon()}

          {/* Content */}
          <button
            type="button"
            className="flex items-center justify-between w-full text-left"
            onClick={() => onToggle(node.id)}
          >
            <span className="flex-1">
              {node.doc?.data?.title ||
                translations[`sidebar.section.${node.name}`] ||
                node.name}
            </span>
            <Icon
              name={isExpanded ? "ChevronDown" : "ChevronRight"}
              size={16}
              className={`shrink-0 ${active ? "text-primary" : ""}`}
            />
          </button>
        </div>
      ) : (
        <a
          href={href ?? `/${locale}/${node.path.join("/")}`}
          className={sharedClasses}
        >
          {/* Indentation spacer for nested items */}
          {node.depth > 0 && (
            <div
              className="shrink-0"
              style={{ width: `${node.depth * 24}px` }}
            />
          )}

          {/* Icon */}
          {renderIcon()}

          {/* Content */}
          <span className="flex-1">{node.doc?.data?.title || node.name}</span>
        </a>
      )}
    </li>
  );
}

interface TreeListProps {
  tree: FlatNode[];
  treeState: Map<string, boolean>;
  onToggle: (folderId: string) => void;
  locale: string;
  translations: Record<string, string>;
  version: string;
}

function TreeList({
  tree,
  treeState,
  onToggle,
  locale,
  translations,
  version,
}: TreeListProps) {
  const isNodeVisible = (node: FlatNode): boolean => {
    if (node.depth === 0) return true;

    // A node is visible only if ALL its ancestor folders are expanded.
    // (This fixes cases where a grandparent folder is collapsed but a child still shows.)
    for (let i = 1; i < node.path.length; i++) {
      const ancestorId = node.path.slice(0, i).join("/");
      if (treeState.get(ancestorId) === false) return false;
    }

    return true;
  };

  return (
    <ul className="space-y-0.5">
      {tree.map((node, index) => {
        const isVisible = isNodeVisible(node);
        const isExpanded = treeState.get(node.id) !== false;
        const prevNode = tree[index - 1];

        // Add separator logic:
        // 1. After "overview" file (before concepts and other content)
        // 2. Before "Legacy Admin" section
        let needsSeparator = false;

        // Check if previous node is "overview" file at root level
        if (
          prevNode &&
          prevNode.depth === 0 &&
          prevNode.type === "file" &&
          prevNode.name === "overview" &&
          node.depth === 0
        ) {
          needsSeparator = true;
        }

        // Add separator before Legacy Admin section
        if (node.depth === 0 && node.id === "admin-decocms-com") {
          needsSeparator = true;
        }

        return (
          <React.Fragment key={node.id}>
            {needsSeparator && (
              <li className="my-3">
                <div className="h-px bg-border/50" />
              </li>
            )}
            <TreeItem
              node={node}
              isVisible={isVisible}
              isExpanded={isExpanded}
              onToggle={onToggle}
              locale={locale}
              translations={translations}
              version={version}
            />
          </React.Fragment>
        );
      })}
    </ul>
  );
}

// No filtering needed - separate content folders per version

export default function Sidebar({
  tree,
  locale,
  translations,
  currentVersion,
}: SidebarProps) {
  // Version state for URL-based navigation
  const [version, setVersion] = useState(currentVersion);

  // Handle version change by navigating to the new version's root page
  const versionRoots: Record<string, string> = {
    latest: "introduction",
    draft: "mcp-mesh/quickstart",
  };
  const handleVersionChange = (newVersion: string) => {
    const root = versionRoots[newVersion] ?? "mcp-mesh/quickstart";
    // Draft is English-only; fall back to "en" when switching to it
    const targetLocale = newVersion === "draft" ? "en" : locale;
    navigate(`/${newVersion}/${targetLocale}/${root}`);
  };

  // Initialize with default state (same on server and client for hydration match)
  const [treeState, setTreeState] = useState<Map<string, boolean>>(() => {
    const initialState = new Map();

    // Default: most sections expanded, some collapsed
    const collapsedByDefault = new Set<string>([
      "admin-decocms-com/getting-started",
      "admin-decocms-com/no-code-guides",
      "admin-decocms-com/full-code-guides",
    ]);

    tree.forEach((node) => {
      if (node.hasChildren) {
        initialState.set(node.id, !collapsedByDefault.has(node.id));
      }
    });

    return initialState;
  });

  // After hydration, apply localStorage state and expand ancestors of current page
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const savedState = JSON.parse(
          window.localStorage.getItem("sidebar-tree-state") || "{}",
        );

        // Get current path to expand ancestors
        const currentPath = window.location.pathname;
        const relativePath = currentPath.replace(`/${locale}/`, "");
        const parts = relativePath.split("/").filter(Boolean);
        const expandedAncestors = new Set<string>();
        for (let i = 1; i <= parts.length - 1; i++) {
          expandedAncestors.add(parts.slice(0, i).join("/"));
        }

        // Build new state with saved values and expanded ancestors
        const newState = new Map();
        const collapsedByDefault = new Set<string>([
          "admin-decocms-com/getting-started",
          "admin-decocms-com/no-code-guides",
          "admin-decocms-com/full-code-guides",
        ]);

        tree.forEach((node) => {
          if (node.hasChildren) {
            const saved = savedState[node.id];
            const defaultExpanded = !collapsedByDefault.has(node.id);
            const shouldExpand =
              typeof saved === "boolean" ? saved : defaultExpanded;

            newState.set(
              node.id,
              expandedAncestors.has(node.id) ? true : shouldExpand,
            );
          }
        });

        setTreeState(newState);
      }
    } catch (error) {
      console.error("Failed to load sidebar state:", error);
    }
  }, [tree, locale]);

  const updateFolderVisibility = (folderId: string, isExpanded: boolean) => {
    setTreeState((prev) => {
      const newState = new Map(prev);
      newState.set(folderId, isExpanded);
      return newState;
    });

    // Save state to localStorage (client-side only)
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const stateToSave: Record<string, boolean> = {};
        treeState.forEach((value, key) => {
          stateToSave[key] = value;
        });
        stateToSave[folderId] = isExpanded;
        window.localStorage.setItem(
          "sidebar-tree-state",
          JSON.stringify(stateToSave),
        );
      }
    } catch (error) {
      // Ignore localStorage errors
      console.error("Failed to save sidebar state to localStorage:", error);
    }
  };

  const handleFolderToggle = (folderId: string) => {
    const currentState = treeState.get(folderId) || false;
    updateFolderVisibility(folderId, !currentState);
  };

  return (
    <div className="flex flex-col h-screen bg-app-background border-r border-border w-[19rem] lg:w-[19rem] w-full max-w-[19rem]">
      {/* Header - hidden on mobile */}
      <div className="hidden lg:flex items-center justify-between px-4 lg:px-6 py-3 shrink-0 border-b border-border">
        <Logo width={67} height={28} />
        <div className="flex items-center gap-1.5">
          <VersionSelector
            currentVersion={version}
            onVersionChange={handleVersionChange}
            inline
          />
          <LanguageSelector locale={locale} compact />
          <ThemeToggle />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 lg:px-8 py-4 min-h-0">
        <TreeList
          tree={tree}
          treeState={treeState}
          onToggle={handleFolderToggle}
          locale={locale}
          translations={translations}
          version={version}
        />
      </div>

      {/* Footer */}
      <div className="px-4 lg:px-8 py-4 border-t border-border shrink-0">
        <div className="space-y-2">
          <a
            href="https://github.com/deco-cx/chat"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Icon name="Github" size={16} className="text-muted-foreground" />
            <span className="flex-1">GitHub</span>
            <GitHubStars />
          </a>
          <a
            href="https://discord.gg/deco-cx"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Icon
              name="MessageCircle"
              size={16}
              className="text-muted-foreground"
            />
            <span className="flex-1">Discord community</span>
            <Icon
              name="ArrowUpRight"
              size={16}
              className="text-muted-foreground"
            />
          </a>
        </div>
      </div>
    </div>
  );
}
