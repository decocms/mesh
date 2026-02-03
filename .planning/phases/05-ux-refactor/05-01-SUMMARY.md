# Summary: Phase 5 - UX Refactor

## Completed

### Task 1: Remove TaskPanel from Sites ✅
- Removed `import { TaskPanel }` from site-list.tsx
- Removed `<TaskPanel />` from the JSX

### Task 2: Add Page Actions to Sites ✅
- Added "Create Page" button in Pages header
- Added "Use as Template" button on page hover (Copy01 icon)
- Added "Edit" button on page hover (Edit02 icon)
- All buttons navigate to Tasks with appropriate context

### Task 3: Create Navigation Helper ✅
- Implemented `navigateToTasks` function in site-list.tsx
- Uses URL query params: `?skill=`, `?template=`, `?edit=`, `?site=`
- Navigates to `/tasks/:connectionId` with params

### Task 4: Handle Context in Task Runner ✅
- Extended `taskBoardSearchSchema` with site context params
- Added `@tanstack/react-router` dependency
- TasksTabContent reads search params and:
  - Pre-selects skill if `?skill=` present
  - Pre-fills task title based on template/edit params
  - Auto-opens "Add Task" form when context params present

### Task 5: Site Preview in Task Runner
- Deferred to future work (not critical for MVP)

## Files Changed

```
packages/mesh-plugin-site-builder/components/site-list.tsx
- Removed TaskPanel import and usage
- Added Plus, Edit02 icons
- Added useNavigate, useParams imports
- Added navigateToTasks function
- Added handleCreatePage, handleUseAsTemplate, handleEditPage
- Updated page row with action buttons

packages/mesh-plugin-task-runner/lib/router.ts
- Extended taskBoardSearchSchema with skill, template, edit, site params

packages/mesh-plugin-task-runner/components/task-board.tsx
- Added useSearch import
- Added useEffect to handle site context params
- TasksTabContent accepts searchParams prop
- Pre-selects skill and pre-fills title from params

packages/mesh-plugin-task-runner/package.json
- Added @tanstack/react-router dependency
```

## Verification

- [x] Sites tab shows no task UI
- [x] "Create Page" button navigates to Tasks with skill selected
- [x] "Use as Template" navigates to Tasks with page context
- [x] "Edit" button navigates to Tasks with edit context
- [x] Task Runner receives and uses the context params

## Commit

```
d11f78e42 feat(site-builder): separate Sites and Tasks UX
```
