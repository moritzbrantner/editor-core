import { describe, expect, test } from "vitest";
import {
  createEditorCollaborationState,
  dedupeEditorRemoteOperations,
  hasSeenEditorRemoteOperation,
  markEditorRemoteOperationSeen,
  pruneEditorPresence,
  removeEditorPresence,
  updateEditorPresence,
} from "./collaboration.js";

describe("editor collaboration", () => {
  test("creates empty collaboration state", () => {
    expect(createEditorCollaborationState({ clientId: "local" })).toEqual({
      clientId: "local",
      presence: {},
      revision: null,
      seenOperationIds: [],
    });
  });

  test("adds, updates, and removes presence immutably", () => {
    const state = createEditorCollaborationState<string>({ clientId: "local" });
    const withPresence = updateEditorPresence(state, {
      clientId: "remote",
      label: "Remote",
      selection: "title",
    });
    const updated = updateEditorPresence(withPresence, {
      clientId: "remote",
      label: "Remote",
      selection: "body",
    });
    const removed = removeEditorPresence(updated, "remote");

    expect(state.presence).toEqual({});
    expect(withPresence.presence.remote?.selection).toBe("title");
    expect(updated.presence.remote?.selection).toBe("body");
    expect(removed.presence).toEqual({});
  });

  test("prunes stale presence with an injected clock", () => {
    const state = createEditorCollaborationState({
      clientId: "local",
      presence: {
        active: {
          clientId: "active",
          lastSeenAt: "2026-06-06T11:59:30.000Z",
        },
        stale: {
          clientId: "stale",
          lastSeenAt: "2026-06-06T11:58:00.000Z",
        },
        unknown: {
          clientId: "unknown",
        },
      },
    });

    const pruned = pruneEditorPresence(state, {
      maxAgeMs: 60_000,
      now: "2026-06-06T12:00:00.000Z",
    });

    expect(Object.keys(pruned.presence)).toEqual(["active", "unknown"]);
  });

  test("deduplicates operation ids and ignores local-client operations", () => {
    const state = markEditorRemoteOperationSeen(
      createEditorCollaborationState({ clientId: "local" }),
      "seen",
    );

    const result = dedupeEditorRemoteOperations(state, [
      { clientId: "remote", id: "seen", operation: { title: "Seen" } },
      { clientId: "local", id: "local-op", operation: { title: "Local" } },
      { clientId: "remote", id: "next", operation: { title: "Next" } },
    ]);

    expect(result.operations.map((operation) => operation.id)).toEqual(["next"]);
    expect(hasSeenEditorRemoteOperation(result.state, "local-op")).toBe(true);
    expect(hasSeenEditorRemoteOperation(result.state, "next")).toBe(true);
  });

  test("enforces seen operation limit", () => {
    let state = createEditorCollaborationState({ clientId: "local" });

    state = markEditorRemoteOperationSeen(state, "a", { limit: 2 });
    state = markEditorRemoteOperationSeen(state, "b", { limit: 2 });
    state = markEditorRemoteOperationSeen(state, "c", { limit: 2 });

    expect(state.seenOperationIds).toEqual(["b", "c"]);
  });
});
