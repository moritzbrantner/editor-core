---
"@moenarch/editor-core": patch
---

Build the package in a `prepare` script so consumers can install it as a commit-pinned git dependency (`git+https://github.com/moritzbrantner/editor-core.git#<sha>` listed in `trustedDependencies`).
