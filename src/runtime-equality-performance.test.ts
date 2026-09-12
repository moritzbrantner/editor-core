import { describe, expect, test, vi } from "vitest";

import { commitEditorRuntime, createEditorRuntime } from "./runtime.js";

describe("editor runtime equality work", () => {
  test("evaluates configured history equality once per commit", () => {
    const equals = vi.fn((left: { value: number }, right: { value: number }) => {
      return left.value === right.value;
    });
    let runtime = createEditorRuntime({
      history: { equals },
      initialDocument: { value: 1 },
    });

    equals.mockClear();
    runtime = commitEditorRuntime(runtime, { value: 2 });

    expect(equals).toHaveBeenCalledTimes(1);
    expect(runtime.revision).toBe(1);

    equals.mockClear();
    runtime = commitEditorRuntime(runtime, { value: 2 });

    expect(equals).toHaveBeenCalledTimes(1);
    expect(runtime.revision).toBe(1);
  });
});
