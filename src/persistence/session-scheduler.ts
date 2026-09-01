import type { EditorSessionScheduler } from "../session.js";

export const defaultEditorSessionScheduler: EditorSessionScheduler = {
  clearTimeout(timer) {
    globalThis.clearTimeout(timer as ReturnType<typeof globalThis.setTimeout>);
  },
  setTimeout(callback, delayMs) {
    return globalThis.setTimeout(callback, delayMs);
  },
};
