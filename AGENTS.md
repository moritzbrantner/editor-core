# Editor Core Agent Instructions

This repository contains headless shared infrastructure for Moritz Brantner editor packages.

## Agent skills

This repository is configured for the Matt Pocock workflow skills and the agent-loop control plane.

- Issue tracker: `docs/agents/issue-tracker.md`
- Triage labels: `docs/agents/triage-labels.md`
- Domain context: `docs/agents/domain.md`
- Planning workflow: `docs/agents/planning-workflow.md`

### Planning workflow

Substantial new work should be planned into GitHub PRD issues instead of implemented directly. See `docs/agents/planning-workflow.md`.

<!-- prettier-ignore-start -->
<!-- verification-harness:start -->
## Verification harness
Run `scripts/verification_harness.py audit` before changing verification surfaces.
Early selection is advisory; `full` remains the handoff gate. See `.harness/README.md`.
<!-- verification-harness:end -->
<!-- prettier-ignore-end -->
