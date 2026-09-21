---
name: skill-optimizer
description:
  'Optimizes AI skills for activation, clarity, and cross-model reliability. Use when creating or editing skill packs,
  diagnosing weak skill uptake, reducing regressions, tuning instruction salience, improving examples, shrinking
  context cost, or setting benchmark/release gates for skills. Trigger terms: skill optimization, activation gap,
  benchmark skill, with/without skill delta, regression, context budget, prompt salience. Third-party skill by
  Matteo Collina (MIT); depends on its rules/ files, so it reaches folder-based agents only.'
type: skill
disable-model-invocation: false
user-invocable: true
tags: [skills, optimization, benchmarking, activation, regressions, prompt-engineering]
agents: [claude, codex, gemini, copilot]
version: 0.1.0
author: Matteo Collina
---

# Skill Optimizer

> **Third-party skill.** Authored by Matteo Collina and redistributed here unchanged from
> [github.com/mcollina/skills](https://github.com/mcollina/skills) under the MIT licence.
> The upstream copyright and permission notice travel with this copy in `LICENSE` beside this file;
> keep them together. Not covered by this repository's own copyright.
>
> Depends on the `rules/` files next to it, which reach folder-based agents only.

## When to use

Use this skill when you need to:

- Improve whether a skill is actually applied by models
- Diagnose why some criteria fail across all models
- Prevent a skill from making outputs worse
- Refactor skill text for stronger retrieval under context pressure
- Build repeatable benchmark loops and release gates

## Optimization loop (default workflow)

1. **Measure baseline and skill-on behavior** (per model, per scenario, per criterion)
2. **Find failure pattern**:
    - universal failure (0% with skill)
    - model-specific weakness
    - regression (negative delta)
3. **Edit for salience**:
    - add explicit triggers
    - add concrete integrated examples
    - tighten checklists and decision rules
4. **Re-run evals** and compare deltas
5. **Ship with guardrails** (documented gate + run history + follow-up issues)

## How to use

Read individual rule files for detailed procedures and templates:

- [rules/benchmark-loop.md](rules/benchmark-loop.md) - End-to-end benchmark loop and scoring
- [rules/activation-design.md](rules/activation-design.md) - Improve retrieval and instruction uptake
- [rules/context-budget.md](rules/context-budget.md) - Reduce token cost without losing behavior
- [rules/regression-triage.md](rules/regression-triage.md) - Diagnose and fix skill-on regressions
- [rules/release-gates.md](rules/release-gates.md) - Go/no-go criteria before shipping skill updates

## Practical heuristics

- Prefer **few high-signal rules** over many soft recommendations
- Put fragile, high-value behaviors in **top-level checklists**
- Include at least one **integrated example** per common scenario
- Add explicit wording for what must **not** be omitted
- Track gains/losses with **with-skill vs without-skill** comparisons
