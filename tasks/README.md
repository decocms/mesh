# Projects Feature - Task Entrypoint

**How to use:** Reference this file (`@tasks/README.md`) in a fresh Cursor thread to start the next pending task.

---

## Task Checklist

Check off each task as it's completed. Start a **fresh thread** for each task.

| Status | Task | File | Start Command |
|--------|------|------|---------------|
| [x] | 001 - Database Schema & Storage | `@tasks/001-database-schema-storage.md` | "Execute task 001" |
| [x] | 002 - MCP Tools | `@tasks/002-mcp-tools.md` | "Execute task 002" |
| [x] | 003 - Routing Refactor | `@tasks/003-routing-refactor.md` | "Execute task 003" |
| [x] | 004 - Project Layout & Context | `@tasks/004-project-layout-context.md` | "Execute task 004" |
| [x] | 005 - Sidebar Groups | `@tasks/005-sidebar-groups.md` | "Execute task 005" |
| [x] | 006 - Topbar & Header | `@tasks/006-topbar-header.md` | "Execute task 006" |
| [x] | 007 - Projects List Page | `@tasks/007-projects-list-page.md` | "Execute task 007" |
| [x] | 008 - Project Settings | `@tasks/008-project-settings.md` | "Execute task 008" |
| [ ] | 009 - Project Creation & Org Hook | `@tasks/009-project-creation.md` | "Execute task 009" |

---

## Quick Start

### For the AI Agent

When this file is referenced, do the following:

1. **Check the checklist above** to find the first unchecked `[ ]` task
2. **Verify prerequisites** are checked (see dependency table below)
3. **Read the task file** for that task
4. **Execute the task** following all instructions
5. **Run verification commands** at the end:
   ```bash
   bun run check && bun run fmt && bun run lint && bun test
   ```
6. **Report completion** - tell the user to mark the checkbox as `[x]` and start a fresh thread for the next task

### For the Human

1. Open a **fresh Cursor thread**
2. Type: `@tasks/README.md Execute the next pending task`
3. Let the agent complete the task
4. When done, **edit this file** to check off the completed task: `[ ]` → `[x]`
5. **Start a new thread** and repeat for the next task

---

## Task Dependencies

```
001 ─────────────────┐
                     ├──► 004 ───┬──► 005 ───┐
003 ─────────────────┘           │           ├──► 007
                                 ├──► 006 ───┤
002 (requires 001) ──────────────┘           ├──► 008
                                             └──► 009
```

| Task | Requires These Completed First |
|------|-------------------------------|
| 001 | None - can start immediately |
| 002 | 001 |
| 003 | None - can start immediately |
| 004 | 001, 003 |
| 005 | 003, 004 |
| 006 | 003, 004 |
| 007 | 001, 002, 003, 004, 005, 006 |
| 008 | 001, 002, 003, 004 |
| 009 | 001, 002, 003, 004 |

**Parallel execution possible:**
- 001 and 003 can run in parallel
- 005 and 006 can run in parallel (after 004)
- 007, 008, 009 can run in parallel (after their deps)

---

## Verification Commands

Every task must pass these before being marked complete:

```bash
bun run check   # TypeScript compilation
bun run fmt     # Code formatting
bun run lint    # Linting
bun test        # Unit tests
```

---

## Key Context (For All Tasks)

### URL Structure
- All routes: `/$org/$project/...`
- `/$org` redirects to `/$org/org-admin`
- `org-admin` is a reserved project slug

### Constants
```typescript
ORG_ADMIN_PROJECT_SLUG = "org-admin"
ORG_ADMIN_PROJECT_NAME = "Organization Admin"
```

### Figma References
- Sidebar: https://www.figma.com/design/CrDRmAP8gmU9LDexqnm0P2/Critiques?node-id=7-21541
- Full Page: https://www.figma.com/design/CrDRmAP8gmU9LDexqnm0P2/Critiques?node-id=7-21508
- Projects List: https://www.figma.com/design/CrDRmAP8gmU9LDexqnm0P2/Critiques?node-id=5-25974

---

## Progress Notes

Use this section to track any issues or notes across tasks:

```
(Add notes here as tasks are completed)
```
