import { applyEditorPatch as applyEditorPatchInternal } from "./patches/apply.js";
import { diffEditorJson as diffEditorJsonInternal } from "./patches/diff.js";
import {
  invertEditorPatch as invertEditorPatchInternal,
  isEditorPatchEmpty as isEditorPatchEmptyInternal,
} from "./patches/invert.js";

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
  options?: DiffEditorJsonOptions,
): EditorPatch {
  return diffEditorJsonInternal(left, right, options);
}

export function applyEditorPatch(
  value: unknown,
  patch: EditorPatch,
  options?: ApplyEditorPatchOptions,
): unknown {
  return applyEditorPatchInternal(value, patch, options);
}

export function invertEditorPatch(patch: EditorPatch): EditorPatch {
  return invertEditorPatchInternal(patch);
}

export function isEditorPatchEmpty(patch: EditorPatch): boolean {
  return isEditorPatchEmptyInternal(patch);
}
