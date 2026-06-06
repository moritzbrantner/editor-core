import { isEditorRecord } from "./json.js";

export type EditorPatchPath = readonly (string | number)[];

export type EditorPatchOperation =
  | { op: "add"; path: EditorPatchPath; value: unknown }
  | { op: "remove"; path: EditorPatchPath; oldValue?: unknown }
  | { op: "replace"; path: EditorPatchPath; value: unknown; oldValue?: unknown };

export type EditorPatch = readonly EditorPatchOperation[];

export type DiffEditorJsonOptions = {
  equals?: (left: unknown, right: unknown) => boolean;
  includeOldValues?: boolean;
};

export type ApplyEditorPatchOptions = {
  strict?: boolean;
};

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

export function invertEditorPatch(patch: EditorPatch): EditorPatch {
  return [...patch].reverse().map((operation) => {
    if (operation.op === "add") {
      return { op: "remove", oldValue: operation.value, path: operation.path };
    }

    if (operation.op === "remove") {
      return { op: "add", path: operation.path, value: operation.oldValue };
    }

    return {
      op: "replace",
      oldValue: operation.value,
      path: operation.path,
      value: operation.oldValue,
    };
  });
}

export function isEditorPatchEmpty(patch: EditorPatch): boolean {
  return patch.length === 0;
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

function isPlainEditorRecord(value: unknown): value is Record<string, unknown> {
  return isEditorRecord(value) && !Array.isArray(value);
}
