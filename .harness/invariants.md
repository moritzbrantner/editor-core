# Project invariants

## INV-001 — Headless entrypoints preserve their dependency boundaries

- Source of truth: repo:CONTEXT.md, repo:docs/adr/0001-headless-persistence-controller.md, repo:docs/adr/0003-command-runtime.md, repo:scripts/architecture-rules.mjs
- Required evidence: static
- Sensitivity: required
- Risk dimensions: security=covered:headless-entrypoint-boundaries; recovery=not-applicable:dependency-structure-only; persistence=covered:persistence-controller-remains-headless; concurrency=not-applicable:dependency-structure-only; migration=not-applicable:no-schema-change; partial-failure=covered:architecture-check-fails-closed; operational=covered:consumer-entrypoint-loading

## INV-002 — Editor runtime semantics remain compatible with the domain contracts

- Source of truth: repo:CONTEXT.md, repo:docs/adr/0001-headless-persistence-controller.md, repo:docs/adr/0002-operation-apply-modes.md, repo:docs/adr/0003-command-runtime.md, repo:docs/adr/0005-editor-session-persistence.md
- Required evidence: behavioral
- Sensitivity: optional
- Risk dimensions: security=not-applicable:headless-editor-state; recovery=covered:persistence-and-history-tests; persistence=covered:persistence-controller-tests; concurrency=covered:in-flight-save-and-remote-apply-tests; migration=covered:serialization-and-operation-migration-tests; partial-failure=covered:typed-failure-and-conflict-tests; operational=covered:runtime-command-and-persistence-tests

## INV-003 — Public API and semver changes are explicit and reviewable

- Source of truth: repo:package.json, repo:docs/api-report.md, repo:CHANGELOG.md
- Required evidence: static, contract
- Sensitivity: optional
- Risk dimensions: security=not-applicable:declaration-contract; recovery=not-applicable:declaration-contract; persistence=covered:persistence-types-in-public-report; concurrency=not-applicable:declaration-contract; migration=covered:public-migration-types; partial-failure=covered:stale-api-report-fails; operational=covered:published-type-consumers

## INV-004 — Packed consumers can install and execute every supported export

- Source of truth: repo:package.json, repo:scripts/smoke-package-exports.mjs, repo:.github/workflows/validate.yml
- Required evidence: contract, integration
- Sensitivity: optional
- Risk dimensions: security=covered:no-unintended-runtime-dependency-loading; recovery=not-applicable:consumer-install-contract; persistence=covered:persistence-subpath-smoke; concurrency=not-applicable:consumer-install-contract; migration=covered:published-export-compatibility; partial-failure=covered:install-build-and-import-fail-closed; operational=covered:clean-packed-consumers

## INV-005 — React and browser integrations remain buildable and usable

- Source of truth: repo:examples/react/vite.config.ts, repo:tests/e2e/react-example.spec.ts, repo:src/browser-session.browser.test.ts, repo:.github/workflows/validate.yml
- Required evidence: behavioral, integration
- Sensitivity: optional
- Risk dimensions: security=not-applicable:local-example-and-component-tests; recovery=covered:browser-persistence-behavior; persistence=covered:react-persistence-adapter-tests; concurrency=covered:browser-interaction-tests; migration=not-applicable:no-fixture-schema-promise; partial-failure=covered:e2e-and-storybook-fail-closed; operational=covered:browser-build-and-render

## INV-006 — The maintained release verification matrix remains green

- Source of truth: repo:package.json, repo:.github/workflows/validate.yml, repo:.github/workflows/publish.yml
- Required evidence: static, integration, performance
- Sensitivity: optional
- Risk dimensions: security=covered:lint-and-package-boundary-checks; recovery=not-applicable:verification-orchestration; persistence=not-applicable:verification-orchestration; concurrency=not-applicable:verification-orchestration; migration=covered:build-and-api-validation; partial-failure=covered:blocking-command-exit-status; operational=covered:build-e2e-storybook-and-performance-gates
