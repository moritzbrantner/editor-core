# Verification harness

This `active` profile describes the independent evidence required for `moritzbrantner/editor-core`.

Source precedence is the reviewed active profile for operational gate mapping; cited human requirements, contracts, ADRs, and repository instructions for intent; tooling-enforced configuration; documented commands; then detection heuristics. Draft profiles and detect output are never policy.

## Workflow

1. Run `scripts/verification_harness.py detect --json` only for read-only discovery.
2. When `required_external_sources` are declared, have the master capture them into ignored `.agent-loop/verification/requirements.json`; pass that same `--requirements-bundle` to `audit`, `select`, `run`, and `report`.
3. Run `scripts/verification_harness.py audit --json` before relying on the profile.
4. Use `select` and targeted/preflight tiers for early feedback.
5. Commit, resolve the reviewed remote base and exact clean handoff commit, and run `audit`.
6. When verification surfaces changed, obtain an independent read-only review.
7. Run the unconditional `full` tier with the independently supplied expected base SHA, exact head SHA, current requirements bundle, and current review receipt when required.
8. Only then record the exact-head local verification receipt and render
   `report --format markdown`. Local workflow emulation is optional diagnostic
   evidence and is not a readiness gate.

Retries are diagnostic: fail-then-pass is uncertain. Skips and quarantines remain evidence gaps. Never weaken tests, thresholds, lint rules, snapshots, timeouts, retries, CI, tolerances, suppressions, or allowlists merely to make a task pass.

For a bug fix, reproduce the defect practically before changing implementation when safe, and keep practical red-before/green-after evidence for the bug test. Derive tests from an identified requirement, invariant, Feature Contract, ADR, or external contract. Review tests separately from implementation, and review verification configuration separately from both. Differential, parity, property, mutation, fuzz, and benchmark checks are optional tools for concrete named risks. Separate files, commands, tools, or agents do not prove evidence independence.

Detailed product intent, invariants, source-of-truth choices, architecture, snapshots, thresholds, flake/skip/quarantine approval, external readiness, state cleanup, required-check changes, reviewer provenance, and final merge/release judgment remain manual. Production-grade verification does not require speculative abstraction or enterprise architecture.

Declared generated outputs may change ordinary ignored paths; Harness, Git, requirements, review, and result namespaces are never generated output. Profile documents and private state inputs must be regular files reached without symlinks. Undeclared writes or residual processes make evidence incomplete. Authoritative tiers also bind tracked content, required base/head commit objects, requirements, and Git refs/config/index state, then revalidate the review receipt after checks and any requested diagnostics callback. Diagnostics callback survivors are killed and make the run incomplete. Results belong in ignored `.agent-loop/verification/` state. Do not commit raw logs, command output, prompts, secrets, environment values, or private issue bodies.
