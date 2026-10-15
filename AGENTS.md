# Editor Core Agent Instructions

This repository contains headless shared infrastructure for Moritz Brantner editor packages.

## Interactive examples and workbenches

- The core package remains headless; do not move product layout or visual styling into editor-core merely to satisfy an example.
- Interactive examples, Storybook stories, and workbenches apply the current shared `ui` conventions from `moritzbrantner/coding-agent-conventions`, especially `PRINCIPLE-009`, `UI-008`, `UI-012`, and `UI-013`.
- Put reusable interaction state machines at the narrowest editor-core seam that genuinely owns them. Consumers may compose those interactions but must not create a competing owner for the same gesture.
- Use examples to demonstrate direct manipulation through the public editor seams; inspectors and forms should supplement that interaction rather than become a second implementation of it.

## Domain context

Read `README.md` for the public package surface and `CONTEXT.md` for the stable Editor Core runtime, operation, command, persistence and autosave vocabulary. Consult the relevant accepted `docs/adr/` decision before changing these boundaries. `CONTEXT.md` remains a cited source of truth for INV-001/INV-002 in `.harness/`; do not delete or move it without separately updating and validating that verification contract.

<!-- prettier-ignore-start -->
<!-- verification-harness:start -->
## Verification harness
Run `scripts/verification_harness.py audit` before changing verification surfaces.
Early selection is advisory; `full` remains the handoff gate. See `.harness/README.md`.
<!-- verification-harness:end -->
<!-- prettier-ignore-end -->
