# Headless persistence controller

Persistent runtime autosave orchestration lives in the headless persistence module, not inside the
React hook. The React hook is an adapter over the controller because retry, in-flight save handling,
latest-revision follow-up saves, stale completion guards, and revision-token behavior are editor
persistence rules rather than React rendering rules.

## Considered Options

- Keep autosave orchestration inside React effects and refs.
- Extract an internal React-only helper.
- Expose a public headless persistence controller.

## Consequences

The persistence subpath owns the public controller interface and its behavior tests. React remains
compatible, but its persistence hook mostly keeps refs fresh and delegates load, save, autosave, and
dispose behavior to the controller.
