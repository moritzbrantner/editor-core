# Performance Baselines

Benchmarks are intentionally advisory for now. CI runs them so regressions are visible, but does not fail on timing changes yet.

Run locally with:

```sh
bun run bench
```

Track these scenarios when reviewing benchmark output:

| Scenario                          | Current benchmark                                              | Target behavior                                                                              |
| --------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Stable JSON stringify             | `stable JSON stringify`                                        | Deterministic key ordering for medium editor documents without surprising allocation spikes. |
| Tree projection                   | `tree projection`                                              | Linear projection cost as node count grows.                                                  |
| Large share payload encode/decode | Add when share payload benchmarks become noisy enough to track | Compression should only be chosen when it produces a meaningfully smaller token.             |

If a benchmark changes substantially, include the before and after output in the pull request.
