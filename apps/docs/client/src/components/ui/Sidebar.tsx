import React, { useEffect, useState } from "react";
import { Logo } from "../../components/atoms/Logo.tsx";
import { Icon } from "../../components/atoms/Icon.tsx";
import { LanguageSelector } from "./LanguageSelector.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";

// GitHub Stars Component
function GitHubStars() {
  const [stars, setStars] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStars = async () => {
      try {
        const response = await fetch(
          "https://api.github.com/repos/deco-cx/chat",
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
}

interface TreeItemProps {
  node: FlatNode;
  isVisible: boolean;
  isExpanded: boolean;
  onToggle: (folderId: string) => void;
  locale: string;
  translations: Record<string, string>;
}

function TreeItem({
  node,
  isVisible,
  isExpanded,
  onToggle,
  locale,
  translations,
}: TreeItemProps) {
  if (!isVisible) return null;

  // Check if this item is active (current page) - client-side only
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (node.type !== "file") return;

    const currentPath = globalThis.location.pathname;
    const docId = node.doc?.id;
    const docPath = docId ? docId.split("/").slice(1).join("/") : null;
    const itemPath = `/${locale}/${docPath ?? node.path.join("/")}`;

    setActive(currentPath === itemPath);
  }, [node.type, node.path, locale, node.doc?.id]);

  const docId = node.doc?.id;
  const docPath = docId ? docId.split("/").slice(1).join("/") : null;
  const href =
    node.type === "file"
      ? `/${locale}/${docPath ?? node.path.join("/")}`
      : null;

  return (
    <li>
      <div
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
          active
            ? "bg-primary/5 text-primary" // Active state
            : node.type === "folder"
              ? "text-muted-foreground hover:bg-muted hover:text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        {/* Indentation spacer for nested items */}
        {node.depth > 0 && (
          <div className="shrink-0" style={{ width: `${node.depth * 24}px` }} />
        )}

        {/* Icon */}
        {node.type === "folder" ? (
          <Icon
            name={
              node.id === "mcp-mesh"
                ? "Network"
                : node.id === "mcp-studio"
                  ? "LayoutDashboard"
                  : node.id === "mcp-mesh/deploy"
                    ? "Rocket"
                    : "Folder"
            }
            size={16}
            className={`shrink-0 ${active ? "text-primary" : ""}`}
          />
        ) : node.doc?.data?.icon ? (
          <Icon
            name={node.doc.data.icon}
            size={16}
            className={`shrink-0 ${active ? "text-primary" : ""}`}
          />
        ) : (
          <Icon
            name="FileText"
            size={16}
            className={`shrink-0 ${active ? "text-primary" : ""}`}
          />
        )}

        {/* Content */}
        {node.type === "folder" ? (
          <button
            type="button"
            className="flex items-center justify-between w-full text-left"
            onClick={() => onToggle(node.id)}
          >
            <span className="flex-1">
              {translations[`sidebar.section.${node.name}`] || node.name}
            </span>
            {node.hasChildren && (
              <Icon
                name={isExpanded ? "ChevronDown" : "ChevronRight"}
                size={16}
                className={`shrink-0 ${active ? "text-primary" : ""}`}
              />
            )}
          </button>
        ) : (
          <a
            href={href ?? `/${locale}/${node.path.join("/")}`}
            className="flex-1"
          >
            {node.doc?.data?.title || node.name}
          </a>
        )}
      </div>
    </li>
  );
}

interface TreeListProps {
  tree: FlatNode[];
  treeState: Map<string, boolean>;
  onToggle: (folderId: string) => void;
  locale: string;
  translations: Record<string, string>;
}

function TreeList({
  tree,
  treeState,
  onToggle,
  locale,
  translations,
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

  // Group nodes to determine when to add separators
  const getNodeGroup = (node: FlatNode): "root-files" | "root-folders" => {
    if (node.depth === 0 && node.type === "file") return "root-files";
    return "root-folders";
  };

  return (
    <ul className="space-y-0.5">
      {tree.map((node, index) => {
        const isVisible = isNodeVisible(node);
        const isExpanded = treeState.get(node.id) !== false;
        const prevNode = tree[index - 1];

        // Add separator when switching between different groups at root level
        let needsSeparator = false;
        if (prevNode && node.depth === 0 && prevNode.depth === 0) {
          const currentGroup = getNodeGroup(node);
          const prevGroup = getNodeGroup(prevNode);
          needsSeparator = currentGroup !== prevGroup;
        }

        // Also add separator when going from nested items back to root level
        if (prevNode && node.depth === 0 && prevNode.depth > 0) {
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
            />
          </React.Fragment>
        );
      })}
    </ul>
  );
}

export default function Sidebar({ tree, locale, translations }: SidebarProps) {
  const [treeState, setTreeState] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    // Load saved state from localStorage
    const savedState = JSON.parse(
      localStorage.getItem("sidebar-tree-state") || "{}",
    );
    const initialState = new Map();

    // If the current page is inside a folder, ensure its ancestor folders are expanded
    // so the active item is visible (even if the default is collapsed).
    const currentPath = globalThis.location.pathname;
    const relativePath = currentPath.replace(`/${locale}/`, "");
    const parts = relativePath.split("/").filter(Boolean);
    const expandedAncestors = new Set<string>();
    for (let i = 1; i <= parts.length - 1; i++) {
      expandedAncestors.add(parts.slice(0, i).join("/"));
    }

    // Initialize tree state - default to expanded (with a few collapsed-by-default sections)
    tree.forEach((node) => {
      if (node.type === "folder") {
        const saved = savedState[node.id];
        // Default: show "Legacy Admin" open, but keep its sections closed (as a compact TOC).
        const collapsedByDefault = new Set<string>([
          "admin-decocms-com/getting-started",
          "admin-decocms-com/no-code-guides",
          "admin-decocms-com/full-code-guides",
        ]);
        const defaultExpanded = collapsedByDefault.has(node.id) ? false : true;

        const shouldExpand =
          typeof saved === "boolean" ? saved : defaultExpanded;

        initialState.set(
          node.id,
          expandedAncestors.has(node.id) ? true : shouldExpand,
        );
      }
    });

    setTreeState(initialState);
  }, [tree]);

  const updateFolderVisibility = (folderId: string, isExpanded: boolean) => {
    setTreeState((prev) => {
      const newState = new Map(prev);
      newState.set(folderId, isExpanded);
      return newState;
    });

    // Save state to localStorage
    const stateToSave: Record<string, boolean> = {};
    treeState.forEach((value, key) => {
      stateToSave[key] = value;
    });
    stateToSave[folderId] = isExpanded;
    localStorage.setItem("sidebar-tree-state", JSON.stringify(stateToSave));
  };

  const handleFolderToggle = (folderId: string) => {
    const currentState = treeState.get(folderId) || false;
    updateFolderVisibility(folderId, !currentState);
  };

  return (
    <div className="flex flex-col h-screen bg-app-background border-r border-border w-[19rem] lg:w-[19rem] w-full max-w-[19rem]">
      {/* Header - hidden on mobile */}
      <div className="hidden lg:flex items-center justify-between px-4 lg:px-8 py-4 shrink-0">
        <Logo width={67} height={28} />
        <ThemeToggle />
      </div>

      {/* Language Select - hidden on mobile */}
      <div className="hidden lg:block px-4 lg:px-8 py-4 shrink-0">
        <LanguageSelector locale={locale} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 lg:px-8 py-4 min-h-0">
        <TreeList
          tree={tree}
          treeState={treeState}
          onToggle={handleFolderToggle}
          locale={locale}
          translations={translations}
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
