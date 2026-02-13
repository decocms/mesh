---
name: plan-with-critique
description: Create implementation plan from user input, then run review-plan for feedback and improvement. Use when the user wants a plan that has been stress-tested and refined before implementation.
---

# Plan with Critique

Create a plan, then run the review-plan skill to critique and improve it.

## When to Use

- User asks for a plan and wants it vetted before implementation
- User wants "plan with critique" or "plan then critique"
- User wants a stress-tested plan with feedback incorporated

## Workflow

### Phase 1: Plan

1. **Use superpowers:writing-plans** to create the implementation plan from user input.
2. Follow the writing-plans skill (bite-sized tasks, exact paths, TDD, DRY, YAGNI).
3. Save plan to `docs/plans/YYYY-MM-DD-<feature-name>.md` or `.cursor/plans/<id>.plan.md`.

### Phase 2: Critique and Improve

4. **Use review-plan skill** – it will:
   - Spawn parallel subagents, each critiquing from one perspective
   - Synthesize critic feedback into Blockers, Important, Minor, Recommendations
   - Apply feedback selectively (adopt/reject/adapt)
   - Add a "Critique Decisions" section to the plan

## Integration

- **superpowers:writing-plans** – Phase 1
- **review-plan** – Phase 2 (handles critique + replan)
- **superpowers:executing-plans** / **superpowers:subagent-driven-development** – after plan is final

## Red Flags

- **Don't** duplicate the improvement logic—review-plan owns it
- **Don't** skip running review-plan after creating the plan
