import { isPlainEditorRecord } from "./records.js";
import type {
  DiffEditorJsonOptions,
  EditorPatch,
  EditorPatchOperation,
  EditorPatchPath,
} from "./types.js";

export function diffEditorJson(
  left: unknown,
  right: unknown,
  options: DiffEditorJsonOptions = {},
): EditorPatch {
  const patch: EditorPatchOperation[] = [];
  diffEditorJsonValue(left, right, [], patch, {
    equals: options.equals ?? Object.is,
    includeOldValues: options.includeOldValues ?? true,
  });
  return patch;
}

function diffEditorJsonValue(
  left: unknown,
  right: unknown,
  path: EditorPatchPath,
  patch: EditorPatchOperation[],
  options: Required<DiffEditorJsonOptions>,
): void {
  if (options.equals(left, right)) {
    return;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    diffEditorJsonArrays(left, right, path, patch, options);
    return;
  }

  if (isPlainEditorRecord(left) && isPlainEditorRecord(right)) {
    diffEditorJsonRecords(left, right, path, patch, options);
    return;
  }

  patch.push({
    op: "replace",
    path,
    value: right,
    ...(options.includeOldValues ? { oldValue: left } : {}),
  });
}

function diffEditorJsonArrays(
  left: readonly unknown[],
  right: readonly unknown[],
  path: EditorPatchPath,
  patch: EditorPatchOperation[],
  options: Required<DiffEditorJsonOptions>,
): void {
  const sharedLength = Math.min(left.length, right.length);

  for (let index = 0; index < sharedLength; index += 1) {
    diffEditorJsonValue(left[index], right[index], [...path, index], patch, options);
  }

  for (let index = left.length - 1; index >= right.length; index -= 1) {
    patch.push({
      op: "remove",
      path: [...path, index],
      ...(options.includeOldValues ? { oldValue: left[index] } : {}),
    });
  }

  for (let index = sharedLength; index < right.length; index += 1) {
    patch.push({ op: "add", path: [...path, index], value: right[index] });
  }
}

function diffEditorJsonRecords(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  path: EditorPatchPath,
  patch: EditorPatchOperation[],
  options: Required<DiffEditorJsonOptions>,
): void {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);

  for (const key of keys) {
    const nextPath = [...path, key];
    if (!Object.hasOwn(right, key)) {
      patch.push({
        op: "remove",
        path: nextPath,
        ...(options.includeOldValues ? { oldValue: left[key] } : {}),
      });
      continue;
    }

    if (!Object.hasOwn(left, key)) {
      patch.push({ op: "add", path: nextPath, value: right[key] });
      continue;
    }

    diffEditorJsonValue(left[key], right[key], nextPath, patch, options);
  }
}
