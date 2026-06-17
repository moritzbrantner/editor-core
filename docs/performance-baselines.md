# Performance Baselines

Benchmarks are checked against `docs/performance-baselines.json`. A run fails only when a
benchmark is slower than its baseline by more than the configured regression budget, currently 40%.

Run locally with:

```sh
bun run bench
```

Run the enforced baseline check with:

```sh
bun run bench:check
```

The enforced check uses Vitest's benchmark JSON output for parsing while still writing the human
terminal output to `benchmark-results/vitest-bench.txt`. It runs 2 benchmark attempts by default and
compares the best observed `hz` for each benchmark against the baseline. Override the attempt count
locally when needed:

```sh
EDITOR_CORE_BENCH_ATTEMPTS=3 bun run bench:check
```

## Published Stable Comparison

Use the Moonlight HTTP stable-comparison harness to compare the local build against the latest
published package:

```sh
bun run test:stable
```

The harness builds `dist`, installs `@moritzbrantner/editor-core@latest` into
`benchmark-results/stable-comparison/published-package`, starts a local HTTP comparison endpoint,
and checks deterministic correctness plus scenario-level throughput. It writes the full report to
`benchmark-results/stable-comparison/report.json`.

Pin a different published target when reviewing a release branch:

```sh
EDITOR_CORE_STABLE_PACKAGE=@moritzbrantner/editor-core@0.3.0 bun run test:stable
```

By default, local throughput may be up to 50% slower than the published package before the command
fails. Override that budget or the per-scenario measurement duration locally:

```sh
EDITOR_CORE_STABLE_MAX_REGRESSION_RATIO=0.35 EDITOR_CORE_STABLE_MIN_DURATION_MS=250 bun run test:stable
```

Track these scenarios when reviewing benchmark output:

| Scenario                       | Current benchmark                            | Target behavior                                                                              |
| ------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Stable JSON stringify          | `stable JSON stringify`                      | Deterministic key ordering for medium editor documents without surprising allocation spikes. |
| Tree projection                | `tree projection`                            | Linear projection cost as node count grows.                                                  |
| Entity indexes                 | `entity indexes`                             | Linear parent/child and root ordering cost for large entity documents.                       |
| Runtime commits                | `runtime commit with validation and aspects` | Commit cost stays bounded when validation and derived aspects are active.                    |
| Merged operation sequences     | `operation runtime merged drag sequence`     | Drag-like operation streams merge without growing undo cost per pointer update.              |
| Operation undo/redo            | `operation runtime undo redo`                | Semantic undo/redo stays cheap after a populated operation history.                          |
| Graph indexes                  | `graph indexes`                              | Incoming/outgoing edge maps remain linear for dense graph documents.                         |
| Timeline indexes               | `timeline indexes`                           | Track item grouping and range sorting stay predictable for large timelines.                  |
| Viewport coordinate transforms | `viewport bulk coordinate transforms`        | Bulk screen/document coordinate math remains suitable for pointer and render loops.          |
| Large selection normalization  | `selection normalize large entity set`       | Stale ids are filtered without quadratic behavior for large multi-selects.                   |
| Migrated document read         | `serialization read migrated document`       | Migration chains and adapter validation remain cheap for import/load flows.                  |

The benchmark suite intentionally excludes tiny wrappers, browser DOM download helpers, and React
hooks. Those paths are either dominated by host environment behavior or covered more meaningfully
by unit, Storybook, and e2e tests. Large share payload encode/decode is also excluded from enforced
baselines for now because the gzip path depends on runtime `CompressionStream` and
`DecompressionStream` support; measuring it locally tends to mix editor-code cost with environment
stream implementation variance.

If a benchmark changes substantially, include the before and after output in the pull request. Run
`bun run bench` several times before updating baselines because local CPU load can make single runs
noisy. Baselines should only be updated after several local benchmark runs and review.
