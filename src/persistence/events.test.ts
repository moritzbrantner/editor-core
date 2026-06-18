import { describe, expect, test, vi } from "vitest";
import { emitRevisionTokenUpdated } from "./events.js";

describe("editor persistence events", () => {
  test("emits revision token updates only when enabled", () => {
    const onEvent = vi.fn();

    emitRevisionTokenUpdated({ onEvent }, "server-1", { emitRevisionToken: true });
    emitRevisionTokenUpdated({ onEvent }, "server-2", { emitRevisionToken: false });

    expect(onEvent).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledWith({
      revisionToken: "server-1",
      type: "revision-token-updated",
    });
  });
});
