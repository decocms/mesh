---
name: plan
description: Use when user explicitly asks to "plan", "create a plan for", or "design implementation approach" for a feature. User says "plan the X feature" or "how would we implement Y". Provides planning plus automatic critique in one workflow.
---

# Plan

Create an implementation plan using a subagent, then automatically critique and improve it.

## When to Use

Invoke this skill when user explicitly requests planning:
- "Plan the authentication feature"
- "Create a plan for the search system"
- "How would we implement real-time notifications?"
- "Design an approach for X"

**Note:** This is typically user-invoked via explicit planning requests, not automatically triggered by agent judgment.

## Workflow

### 1. Spawn Planning Subagent

Use Task tool with `subagent_type: "general-purpose"`:
```
Create a detailed implementation plan for [feature description].

Write the plan to /plans/<feature-name>.plan.md following superpowers:writing-plans format:
- Bite-sized tasks
- Exact file paths
- Test-driven approach
- DRY principles

Include: overview, phases, files to modify, testing strategy.
```

### 2. Run Critique (Mandatory)

After the plan is written, IMMEDIATELY invoke the review-plan skill:
```
Use the Skill tool to invoke "review-plan" with the plan path.
```

**Why critique is not optional:**
- Plans have blind spots (duplication, security, performance)
- Multiple perspectives catch what one reviewer misses
- "Quick sketch" plans still need validation
- Better to find gaps now than during implementation

## Red Flags

**These indicate you should have used this skill but didn't:**
- Created a plan but didn't critique it
- User asked to "plan" something and you just planned (without review-plan)
- Wrote plan to file but stopped there
- Justified skipping critique because plan "seems good"
- Skipped critique for "quick" or "basic" plans

**All of these mean: Stop and invoke review-plan on the plan you created.**

## Common Rationalizations (Don't Do These)

| Excuse | Reality |
|--------|---------|
| "Plan looks comprehensive" | Plans always have blind spots. Critique finds them. |
| "User wanted quick sketch" | Quick plans need validation MORE, not less. |
| "I can review it myself" | Single perspective misses issues. Need multiple critics. |
| "Will critique later" | Later never happens. Critique immediately. |
