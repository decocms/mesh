# Mesh Skills

This folder contains Agent Skills for AI-assisted development of the Mesh platform.

## Available Skills

| Skill | Description |
|-------|-------------|
| [mesh-development](mesh-development/SKILL.md) | Build features for MCP Mesh - coding conventions, plugins, tools, UI |

## Skill Format

Each skill is a folder containing:
- `SKILL.md` - Main skill file with YAML frontmatter (`name`, `description`)
- `references/` - Supporting documentation and examples

## Using Skills

Skills are automatically discovered by the Task Runner plugin when connected to this workspace via a local-fs MCP.

1. Connect a local-fs MCP pointing to this repository
2. Open the Tasks plugin in Mesh
3. Skills appear in the Skills panel
4. Click "Apply" to create tasks based on a skill

## Creating New Skills

1. Copy an existing skill folder
2. Update the YAML frontmatter in `SKILL.md`
3. Add relevant content and references
4. The skill will auto-appear in the Tasks plugin
