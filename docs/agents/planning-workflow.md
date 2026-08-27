# Planning Workflow

This repository uses the canonical agent-loop planning rules in `~/.codex/skills/moenarch-setup-agent-loop-skills/planning-workflow.md`. GitHub Issues are the durable work queue; repo-specific facts stay in `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, and `docs/agents/domain.md`.

## Default for substantial work

Default substantial future work to a GitHub PRD issue rather than direct implementation. Substantial work includes multi-step changes, ambiguous product behavior, cross-module work, schema or API changes, user-facing flows, or work that would benefit from independent implementation slices. Tiny one-shot changes may be implemented directly.

## PRD and slice rules

A PRD must include explicit acceptance criteria and out-of-scope boundaries before it receives both `prd` and `ready-for-agent`. The `prd` and `ready-for-agent` pair authorizes later routing through the agent loop.

Implementation slices must include this parent reference before receiving `ready-for-agent`:

```markdown
## Parent

#<parent-prd-issue-number>
```

## Stop point and overrides

After creating a PRD issue, report its number or URL and stop the planning thread. Do not create implementation slices by default: `moenarch-agent-loop` or a later `moenarch-to-issues` pass handles slicing. Explicit user direction to implement directly overrides this default unless it conflicts with safety, permissions, or repository policy.

## Model policy

Agent-loop workers use the hosted model policy from the installed `moenarch-agent-loop` skill. See `~/.codex/skills/moenarch-agent-loop/references/model-policy.md`.
