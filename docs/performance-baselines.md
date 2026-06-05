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

Track these scenarios when reviewing benchmark output:

| Scenario                          | Current benchmark                                              | Target behavior                                                                              |
| --------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Stable JSON stringify             | `stable JSON stringify`                                        | Deterministic key ordering for medium editor documents without surprising allocation spikes. |
| Tree projection                   | `tree projection`                                              | Linear projection cost as node count grows.                                                  |
| Large share payload encode/decode | Add when share payload benchmarks become noisy enough to track | Compression should only be chosen when it produces a meaningfully smaller token.             |

If a benchmark changes substantially, include the before and after output in the pull request. Run
`bun run bench` several times before updating baselines because local CPU load can make single runs
noisy.
