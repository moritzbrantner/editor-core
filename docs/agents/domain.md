# Domain Context

This is a single-context repository.

Agents must read root `CONTEXT.md` before making domain decisions. It defines the Editor Core language and vocabulary.

Agents should also read relevant ADRs under `docs/adr/` before changing architecture, persistence behavior, operation semantics, command runtime behavior, public APIs, or release workflow.

The domain is Editor Core: headless editor state, persistence, synchronization, command runtime, operation runtime, and React integration vocabulary for downstream editor packages.
