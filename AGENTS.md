# Editor Core Agent Instructions

This repository contains headless shared infrastructure for Moritz Brantner editor packages.

## Interactive examples and workbenches

- The core package remains headless; do not move product layout or visual styling into editor-core merely to satisfy an example.
- Interactive examples, Storybook stories, and workbenches apply the current shared `ui` conventions from `moritzbrantner/coding-agent-conventions`, especially `PRINCIPLE-009`, `UI-008`, `UI-012`, and `UI-013`.
- Put reusable interaction state machines at the narrowest editor-core seam that genuinely owns them. Consumers may compose those interactions but must not create a competing owner for the same gesture.
- Use examples to demonstrate direct manipulation through the public editor seams; inspectors and forms should supplement that interaction rather than become a second implementation of it.

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
