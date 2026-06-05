import { describe, expect, test } from "vitest";
import { createEditorAspect, getEditorResolvedAspect, resolveEditorAspects } from "./aspects.js";

type Document = {
  body: string;
  title: string;
};

describe("editor aspects", () => {
  test("resolves aspect values from a document and origin", () => {
    const wordCount = createEditorAspect<Document, number>({
      derive: ({ document }) => document.body.trim().split(/\s+/u).filter(Boolean).length,
      id: "word-count",
      label: "Word count",
    });
    const origin = { actorId: "actor-1", source: "test" };

    const snapshot = resolveEditorAspects({ body: "one two", title: "Draft" }, [wordCount], {
      origin,
    });

    expect(snapshot.revision).toBe(0);
    expect(snapshot.origin).toBe(origin);
    expect(snapshot.aspects["word-count"]).toEqual({
      changed: true,
      id: "word-count",
      label: "Word count",
      value: 2,
    });
    expect(getEditorResolvedAspect<number>(snapshot, "word-count")?.value).toBe(2);
    expect(getEditorResolvedAspect<number>(snapshot, "missing")).toBeNull();
  });

  test("increments revisions and marks unchanged aspects with custom equality", () => {
    const titleLength = createEditorAspect<Document, { value: number }>({
      derive: ({ document }) => ({ value: document.title.length }),
      equals: (left, right) => left.value === right.value,
      id: "title-length",
    });

    const previous = resolveEditorAspects({ body: "", title: "Draft" }, [titleLength]);
    const next = resolveEditorAspects({ body: "changed", title: "Other" }, [titleLength], {
      previous,
    });

    expect(next.revision).toBe(1);
    expect(next.aspects["title-length"]?.changed).toBe(false);
  });

  test("marks changed aspects when values differ and honors explicit revisions", () => {
    const body = createEditorAspect<Document, string>({
      derive: ({ document }) => document.body,
      id: "body",
    });

    const previous = resolveEditorAspects({ body: "before", title: "" }, [body]);
    const next = resolveEditorAspects({ body: "after", title: "" }, [body], {
      previous,
      revision: 12,
    });

    expect(next.revision).toBe(12);
    expect(next.aspects.body?.changed).toBe(true);
  });

  test("throws on duplicate aspect ids", () => {
    const first = createEditorAspect<Document, string>({
      derive: ({ document }) => document.title,
      id: "duplicate",
    });
    const second = createEditorAspect<Document, string>({
      derive: ({ document }) => document.body,
      id: "duplicate",
    });

    expect(() => resolveEditorAspects({ body: "", title: "" }, [first, second])).toThrow(
      'Duplicate editor aspect id "duplicate".',
    );
  });
});
