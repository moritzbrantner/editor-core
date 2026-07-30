# Canonical package identity

`@moenarch/editor-core@^0.4.1` is the sole supported Editor Core package line. New and migrated
consumers use the `@moenarch/editor-core` package identity for root and subpath imports.

`@moritzbrantner/editor-core` is a legacy identity. It receives an npm deprecation notice and
migration guidance, but no compatibility shim or dual-maintained release line. A shim would allow
both identities to remain in dependency graphs, making duplicate Core implementations and divergent
version support possible. Migration guidance keeps ownership of the change with each consumer and
leaves one package identity to test, release, and support.

The supported editor-family UI dependency floor is `@moritzbrantner/ui@^1.1.0`.

## Considered Options

- Maintain releases under both package identities.
- Publish `@moritzbrantner/editor-core` as a compatibility re-export of
  `@moenarch/editor-core`.
- Deprecate the legacy identity with migration guidance and support only
  `@moenarch/editor-core`.

## Consequences

Consumers must update their dependency and import specifiers rather than relying on a compatibility
package. Editor Core maintains and verifies one canonical release line, and editor-family packages
share the same UI compatibility floor.
