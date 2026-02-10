# Decopilot Quickstart Redesign - Design Document

**Date:** 2026-02-10
**Status:** Design Phase

## Overview

Redesign the decopilot quickstart guide to focus on practical usage for non-technical e-commerce teams (designers, content creators, project managers) rather than technical implementation details. Use progressive disclosure to introduce features naturally through real-world scenarios.

## Target Audience

- E-commerce team members with mixed backgrounds
- Roles: designers, content creators, project managers, merchandisers
- May not have programming experience
- Need to accomplish practical e-commerce tasks

## Design Principles

1. **Action-oriented** - Show what to ask for, not how it works internally
2. **Progressive complexity** - Start simple, gradually introduce advanced features
3. **Visual interactions** - Use ASCII art to show user/decopilot conversations
4. **Short sections** - Keep each section concise (150-200 words max)
5. **E-commerce context** - All examples relate to online retail operations

## Content Structure

### Section 1: Simple Requests

**Purpose:** Show basic decopilot usage without any complexity

**Examples:**
- Update product descriptions for a sale
- Check inventory levels
- Find products missing images

**Key learning:** Just ask decopilot in natural language, get results back

**Length:** ~150 words + 2-3 ASCII art examples

---

### Section 2: Using Subtasks for Heavy Work

**Purpose:** Introduce subtasks when work gets complex or generates lots of output

**Examples:**
- Analyze stock ruptures across warehouses
- Research competitor pricing
- Audit product data quality

**Key learning:** Use subtasks to keep main conversation clean, get back summaries

**Length:** ~200 words + 1-2 ASCII art examples

---

### Section 3: Working with Specialist Agents

**Purpose:** Show how agents bring domain expertise to subtasks

**Examples:**
- Inventory Specialist for demand forecasting
- Shipping Agent for logistics optimization
- Customer Service Agent for support strategy

**Key learning:** Agents are specialists you can call on for focused tasks

**Length:** ~200 words + 1-2 ASCII art examples

---

### Section 4: Managing Context for Long Workflows

**Purpose:** Introduce context management when working on multi-step projects

**Examples:**
- Product launch preparation over multiple days
- When to use `/compact` command
- How subtasks help manage context

**Key learning:** Keep conversations productive by managing context strategically

**Length:** ~200 words + 1 ASCII art example

---

### Section 5: Switching Scopes for Different Work

**Purpose:** Show when to switch between organization/project/agent scopes

**Examples:**
- Organization scope: Connect Shopify or set up integrations
- Project scope: Day-to-day feature development
- Agent scope: Specialized tasks with focused tools

**Key learning:** Different scopes give you different capabilities

**Length:** ~150 words + 1 ASCII art example

---

### Closing: Putting It All Together

**Purpose:** Quick recap and encourage exploration

**Content:**
- Brief summary of progression
- Reminder to experiment
- Links to deeper documentation

**Length:** ~100 words

## ASCII Art Style

Use simple box drawing and arrows to show conversation flow:

```
You → "Check inventory for SKU-123"
     ↓
Decopilot checks stock levels
     ↓
You ← "SKU-123: 47 units in stock
       Last restock: Feb 8
       Reorder point: 20 units"
```

For multi-step or subtask flows:

```
You → "Run subtask: analyze stock ruptures"
     ↓
Subtask starts (isolated context)
     ↓
Analyzes 500 SKUs across 3 warehouses
     ↓
You ← Summary: "3 critical items need reorder:
       - SKU-123: 8 units (reorder at 10)
       - SKU-456: 5 units (reorder at 15)
       - SKU-789: 2 units (reorder at 5)"
```

## Removed Content

The following will be removed from the current quickstart:

- All TypeScript code examples
- Internal implementation details (tool_enable, tool_search, etc.)
- Mermaid sequence diagrams showing tool calls
- Technical explanations of the agentic loop
- References to "defineTool()", "MeshContext", etc.

These technical details remain in the Architecture and Tools documentation where they belong.

## Links to Other Docs

Each section will link to relevant deep-dive docs:

- Section 2 → Tasks documentation
- Section 3 → Agents documentation
- Section 4 → Context documentation
- Section 5 → Scopes documentation

## Success Criteria

A successful redesign will:

1. Be understandable by non-programmers
2. Show practical e-commerce use cases
3. Progressively introduce concepts
4. Use visual examples (ASCII art)
5. Keep sections short and scannable
6. Link to technical docs for those who want depth

## Next Steps

1. Write complete draft with all sections
2. Review ASCII art examples for clarity
3. Validate e-commerce examples are realistic
4. Ensure links to other docs are correct
5. Get user approval before implementation
