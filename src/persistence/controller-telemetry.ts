import { getEditorTelemetryErrorName, type EditorTelemetry } from "../telemetry.js";
import type { EditorPersistenceEvent, EditorPersistenceEventHandler } from "./types.js";

export type EditorPersistenceTelemetryTrigger = "manual" | "autosave";

/**
 * Wraps the host's persistence event handler for one load or save call so its outcome is also
 * reported as telemetry, with the call's duration and one correlation ID.
 */
export function observePersistenceTelemetry(
  telemetry: EditorTelemetry | undefined,
  onEvent: EditorPersistenceEventHandler | undefined,
  trigger: EditorPersistenceTelemetryTrigger,
): EditorPersistenceEventHandler | undefined {
  if (!telemetry) {
    return onEvent;
  }

  const correlationId = telemetry.correlationId();
  let startedAt = telemetry.now();
  let loadRevision = 0;
  const options = () => ({ correlationId, durationMs: telemetry.now() - startedAt });
  const report = (event: EditorPersistenceEvent) => {
    switch (event.type) {
      case "load-start":
        loadRevision = event.revision;
        startedAt = telemetry.now();
        return;
      case "save-start":
        startedAt = telemetry.now();
        return;
      case "load-success":
        telemetry.emit(
          "persistence.load",
          { revision: event.revision, status: "loaded" },
          options(),
        );
        return;
      case "load-error":
        telemetry.emit(
          "persistence.load",
          {
            errorName: getEditorTelemetryErrorName(event.error),
            revision: loadRevision,
            status: "failed",
          },
          options(),
        );
        return;
      case "save-success":
        telemetry.emit(
          "persistence.save",
          { revision: event.revision, status: "saved", trigger },
          options(),
        );
        return;
      case "save-error":
      case "save-conflict":
        telemetry.emit(
          "persistence.save",
          {
            errorName: getEditorTelemetryErrorName(event.error),
            revision: event.revision,
            status: event.type === "save-error" ? "failed" : "conflict",
            trigger,
          },
          options(),
        );
        return;
      case "save-skipped":
        telemetry.emit(
          "persistence.save",
          { reason: event.reason, revision: event.revision, status: "skipped", trigger },
          options(),
        );
        return;
      case "revision-token-updated":
        return;
    }
  };

  return (event) => {
    report(event);
    onEvent?.(event);
  };
}
