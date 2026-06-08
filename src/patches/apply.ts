import { isPlainEditorRecord } from "./records.js";
import type {
  ApplyEditorPatchOptions,
  EditorPatch,
  EditorPatchOperation,
  EditorPatchPath,
} from "./types.js";

export function applyEditorPatch(
  value: unknown,
  patch: EditorPatch,
  options: ApplyEditorPatchOptions = {},
): unknown {
  return patch.reduce(
    (current, operation) => applyEditorPatchOperation(current, operation, options),
    value,
  );
}

function applyEditorPatchOperation(
  value: unknown,
  operation: EditorPatchOperation,
  options: ApplyEditorPatchOptions,
): unknown {
  if (operation.path.length === 0) {
    if (operation.op === "remove") {
      return undefined;
    }
    return operation.value;
  }

  const result = applyEditorPatchAtPath(value, operation, 0, options.strict === true);
  return result.applied ? result.value : value;
}

function applyEditorPatchAtPath(
  current: unknown,
  operation: EditorPatchOperation,
  depth: number,
  strict: boolean,
): { applied: boolean; value: unknown } {
  const segment = operation.path[depth];
  const leaf = depth === operation.path.length - 1;

  if (leaf) {
    return applyEditorPatchLeaf(current, segment, operation, strict);
  }

  const child = getEditorPatchChild(current, segment);
  if (!child.exists) {
    assertEditorPatchPath(strict, operation.path);
    return { applied: false, value: current };
  }

  const nextChild = applyEditorPatchAtPath(child.value, operation, depth + 1, strict);
  if (!nextChild.applied) {
    return { applied: false, value: current };
  }

  return setEditorPatchChild(current, segment, nextChild.value, strict);
}

function applyEditorPatchLeaf(
  current: unknown,
  segment: string | number,
  operation: EditorPatchOperation,
  strict: boolean,
): { applied: boolean; value: unknown } {
  if (operation.op === "add" || operation.op === "replace") {
    return setEditorPatchChild(current, segment, operation.value, strict);
  }

  return removeEditorPatchChild(current, segment, strict);
}

function getEditorPatchChild(
  current: unknown,
  segment: string | number,
): { exists: boolean; value: unknown } {
  if (
    Array.isArray(current) &&
    typeof segment === "number" &&
    segment >= 0 &&
    segment < current.length
  ) {
    return { exists: true, value: current[segment] };
  }

  if (
    isPlainEditorRecord(current) &&
    typeof segment === "string" &&
    Object.hasOwn(current, segment)
  ) {
    return { exists: true, value: current[segment] };
  }

  return { exists: false, value: undefined };
}

function setEditorPatchChild(
  current: unknown,
  segment: string | number,
  value: unknown,
  strict: boolean,
): { applied: boolean; value: unknown } {
  if (Array.isArray(current) && typeof segment === "number") {
    if (segment < 0 || segment > current.length) {
      assertEditorPatchPath(strict, [segment]);
      return { applied: false, value: current };
    }

    const next = [...current];
    next[segment] = value;
    return { applied: true, value: next };
  }

  if (isPlainEditorRecord(current) && typeof segment === "string") {
    return {
      applied: true,
      value: {
        ...current,
        [segment]: value,
      },
    };
  }

  assertEditorPatchPath(strict, [segment]);
  return { applied: false, value: current };
}

function removeEditorPatchChild(
  current: unknown,
  segment: string | number,
  strict: boolean,
): { applied: boolean; value: unknown } {
  if (
    Array.isArray(current) &&
    typeof segment === "number" &&
    segment >= 0 &&
    segment < current.length
  ) {
    return {
      applied: true,
      value: current.filter((_, index) => index !== segment),
    };
  }

  if (
    isPlainEditorRecord(current) &&
    typeof segment === "string" &&
    Object.hasOwn(current, segment)
  ) {
    const { [segment]: _removed, ...rest } = current;
    void _removed;
    return { applied: true, value: rest };
  }

  assertEditorPatchPath(strict, [segment]);
  return { applied: false, value: current };
}

function assertEditorPatchPath(strict: boolean, path: EditorPatchPath): void {
  if (strict) {
    throw new Error(`Cannot apply editor patch at path "${path.join(".")}".`);
  }
}
