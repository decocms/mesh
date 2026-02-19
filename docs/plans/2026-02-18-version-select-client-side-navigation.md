# Version Select Client-Side Navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `window.location.href` in the version selector with Astro's `navigate()` to enable smooth client-side navigation without full page reloads.

**Architecture:** Enable Astro's built-in `<ClientRouter />` in the docs layout (which intercepts navigation and does fetch + DOM swap instead of full reloads), then use `navigate()` from `astro:transitions/client` in the React sidebar component's version change handler. Fix the mobile menu event listener registration to survive client-side navigations.

**Tech Stack:** Astro 5.6.1 (built-in `astro:transitions`), React 19, TypeScript

---

## Context: How the current code works

- URL structure: `/:version/:locale/:slug` e.g. `/latest/en/mcp-mesh/quickstart`
- `Sidebar.tsx` renders with `currentVersion` prop and has a `handleVersionChange` function
- `VersionSelector` (inside `Sidebar.tsx`) calls `onVersionChange(newVersion)` → `Sidebar.handleVersionChange`
- `Sidebar.handleVersionChange` replaces the version segment in the path and assigns `window.location.href` → **full page reload**
- `VersionSelector.handleVersionChange` also has a dead `window.history.pushState` adding `?version=xxx` query param — this is overridden immediately by the `window.location.href` in the parent

## Files to touch

- `apps/docs/client/src/layouts/DocsLayout.astro` — add `<ClientRouter />`, fix mobile menu listener
- `apps/docs/client/src/components/ui/Sidebar.tsx` — use `navigate()`, remove dead `pushState`

---

## Task 1: Add Astro ClientRouter to DocsLayout

**Files:**
- Modify: `apps/docs/client/src/layouts/DocsLayout.astro:121` (html tag, add import to frontmatter)

### Step 1: Add the import in the frontmatter

Open `apps/docs/client/src/layouts/DocsLayout.astro`. In the frontmatter (`---` block, around line 1-13), add this import:

```astro
import { ClientRouter } from 'astro:transitions';
```

So the top of the frontmatter becomes:

```astro
---
import BaseHead from "../components/ui/BaseHead.astro";
import Footer from "../components/ui/Footer.astro";
import Sidebar from "../components/ui/Sidebar.astro";
import TableOfContents from "../components/ui/TableOfContents.astro";
import { Logo } from "../components/atoms/Logo";
import { Icon } from "../components/atoms/Icon";
import { LanguageSelector } from "../components/ui/LanguageSelector";
import { ThemeToggle } from "../components/ui/ThemeToggle";
import { getCollection } from "astro:content";
import { siteConfig } from "../config/site";
import "../styles/global.css";
import { ClientRouter } from 'astro:transitions';
// ... rest of frontmatter unchanged
---
```

### Step 2: Add `<ClientRouter />` inside `<head>`

In `DocsLayout.astro`, find the `<head>` section (around line 122-177). Add `<ClientRouter />` as the **first** element inside `<head>`, before any other content:

```html
<html lang="en" data-theme="light">
  <head>
    <ClientRouter />
    <meta charset="utf-8" />
    ...
```

### Step 3: Fix mobile menu script to survive client-side navigations

The mobile menu script in `DocsLayout.astro` currently uses `DOMContentLoaded` (around line 206). With View Transitions enabled, `DOMContentLoaded` only fires on the **first** page load, not on subsequent client-side navigations. This breaks the mobile menu after any client-side link click.

Find this in `DocsLayout.astro` (around line 206):

```javascript
document.addEventListener("DOMContentLoaded", function () {
```

Replace it with `astro:page-load`, which fires both on initial load AND on every client-side navigation:

```javascript
document.addEventListener("astro:page-load", function () {
```

The full updated `<script>` block (replacing lines 179-239):

```astro
<script>
  // Mobile menu functionality
  function toggleMobileMenu() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("mobile-overlay");

    if (!sidebar || !overlay) return;

    if (sidebar.classList.contains("hidden")) {
      sidebar.classList.remove("hidden");
      overlay.classList.remove("hidden");
    } else {
      closeMobileMenu();
    }
  }

  function closeMobileMenu() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("mobile-overlay");

    if (!sidebar || !overlay) return;

    sidebar.classList.add("hidden");
    overlay.classList.add("hidden");
  }

  // Add event listeners on every page load (including client-side navigations)
  document.addEventListener("astro:page-load", function () {
    const menuButton = document.getElementById("mobile-menu-button");
    const overlay = document.getElementById("mobile-overlay");

    if (menuButton) {
      menuButton.addEventListener("click", toggleMobileMenu);
    }

    if (overlay) {
      overlay.addEventListener("click", closeMobileMenu);
    }

    // Close menu on escape key
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        closeMobileMenu();
      }
    });

    // Folder click functionality for breadcrumbs
    const folderButtons = document.querySelectorAll("[data-folder-click]");
    folderButtons.forEach((button) => {
      button.addEventListener("click", function () {
        // On mobile, open the sidebar
        if (window.innerWidth < 1024) {
          // lg breakpoint
          toggleMobileMenu();
        }
      });
    });
  });
</script>
```

### Step 4: Verify dev server starts without errors

Run: `bun run docs:dev`
Expected: Server starts on port 4000, no TypeScript or Astro errors in terminal.

### Step 5: Commit

```bash
git add apps/docs/client/src/layouts/DocsLayout.astro
git commit -m "feat(docs): enable Astro client-side routing in docs layout"
```

---

## Task 2: Use navigate() for version switching in Sidebar.tsx

**Files:**
- Modify: `apps/docs/client/src/components/ui/Sidebar.tsx`

### Step 1: Add navigate import

At the top of `apps/docs/client/src/components/ui/Sidebar.tsx` (after the existing React import on line 1), add:

```typescript
import { navigate } from 'astro:transitions/client';
```

So lines 1-5 become:

```typescript
import React, { useEffect, useState } from "react";
import { navigate } from 'astro:transitions/client';
import { Logo } from "../../components/atoms/Logo";
import { Icon } from "../../components/atoms/Icon";
import { LanguageSelector } from "./LanguageSelector";
import { ThemeToggle } from "./ThemeToggle";
```

### Step 2: Replace window.location.href with navigate()

Find `handleVersionChange` in the `Sidebar` component (around lines 399-404):

**Before:**
```typescript
  // Handle version change by navigating to new URL
  const handleVersionChange = (newVersion: string) => {
    const currentPath = window.location.pathname;
    // Replace version in path: /latest/en/... -> /draft/en/...
    const newPath = currentPath.replace(`/${version}/`, `/${newVersion}/`);
    window.location.href = newPath;
  };
```

**After:**
```typescript
  // Handle version change by navigating to new URL
  const handleVersionChange = (newVersion: string) => {
    const currentPath = window.location.pathname;
    // Replace version in path: /latest/en/... -> /draft/en/...
    const newPath = currentPath.replace(`/${version}/`, `/${newVersion}/`);
    navigate(newPath);
  };
```

### Step 3: Remove dead pushState code in VersionSelector

Find `handleVersionChange` inside the `VersionSelector` component (around lines 89-100):

**Before:**
```typescript
  const handleVersionChange = (newVersion: string) => {
    if (newVersion === currentVersion) return;

    // Update the version query parameter without reloading
    const url = new URL(window.location.href);
    url.searchParams.set("version", newVersion);
    window.history.pushState({}, "", url.toString());

    // Update state
    setCurrentVersion(newVersion);
    onVersionChange(newVersion);
  };
```

**After (remove the dead pushState block):**
```typescript
  const handleVersionChange = (newVersion: string) => {
    if (newVersion === currentVersion) return;

    setCurrentVersion(newVersion);
    onVersionChange(newVersion);
  };
```

The `pushState` was adding a `?version=xxx` query param that was immediately overridden by the parent's `window.location.href`. It's dead code.

### Step 4: Verify in browser

Start the dev server (`bun run docs:dev`) and open `http://localhost:4000`.

1. Navigate to any doc page (e.g. `/latest/en/mcp-mesh/quickstart`)
2. Open browser DevTools → Network tab, filter by "Doc" or "Fetch/XHR"
3. Switch the version selector to "Draft"
4. Verify:
   - URL changes from `/latest/en/...` to `/draft/en/...`
   - The Network tab shows a `fetch()` request for the new page HTML — **not** a full document navigation (no browser loading indicator in the tab)
   - The page content updates correctly
5. Switch back to "Latest" — same smooth behavior
6. Click other sidebar links — also smooth (no full reloads)

### Step 5: Commit

```bash
git add apps/docs/client/src/components/ui/Sidebar.tsx
git commit -m "feat(docs): use client-side navigation for version switching"
```

---

## Notes

- **LanguageSelector** (`apps/docs/client/src/components/ui/LanguageSelector.tsx`) also uses `globalThis.location.href` for language switching — same pattern, not in scope for this plan but is an obvious follow-up.
- **TypeScript types**: `astro:transitions/client` and `astro:transitions` are both typed by Astro's built-in type declarations. No extra `@types` packages needed.
- **Static output**: This is an SSG site. The `<ClientRouter />` makes link navigation client-side by fetching the pre-built HTML pages via `fetch()` and swapping the DOM, rather than triggering full browser navigations. Pages are still static files — nothing server-side changes.
