/**
 * Provider-neutral, opt-in editor telemetry.
 *
 * Editor Core never sends telemetry on its own. Hosts pass an `EditorTelemetry` created with
 * `createEditorTelemetry` to the runtimes they want to observe; events carry metadata, counts and
 * durations, never user-authored document content. Sink and processor failures are swallowed so
 * telemetry can never break an editor operation.
 */

export const editorTelemetrySchemaVersion = 1;

export type EditorTelemetryIssueCounts = {
  issueCount: number;
  errorCount: number;
  warningCount: number;
};

/** Attributes for every event name Editor Core defines. */
export type EditorTelemetryEventMap = {
  /** A semantic operation was applied, rejected by preflight, or left the document unchanged. */
  "operation.apply": EditorTelemetryIssueCounts & {
    operationId: string;
    status: "applied" | "rejected" | "unchanged";
    merged: boolean;
    revision: number;
  };
  "operation.undo": { status: "applied" | "empty"; revision: number };
  "operation.redo": { status: "applied" | "empty"; revision: number };
  /** A command runtime handled a key event. */
  "command.run": {
    status: "ran" | "ignored" | "failed";
    commandId?: string;
    reason?: string;
    errorName?: string;
  };
  /** A Runtime validator produced a summary for one document revision. */
  "validation.summary": EditorTelemetryIssueCounts & { revision: number };
  "persistence.load": { status: "loaded" | "failed"; revision: number; errorName?: string };
  "persistence.save": {
    status: "saved" | "skipped" | "failed" | "conflict";
    trigger: "manual" | "autosave";
    revision: number;
    reason?: "clean" | "blocked" | "in-flight";
    errorName?: string;
  };
  /** A stored payload was migrated to the current document shape, or could not be. */
  "session.migration": { status: "migrated" | "failed"; slot: string };
  /** A session found, restored or discarded recoverable work. */
  "session.recovery": {
    status: "found" | "restored" | "discarded";
    kind: "unsaved" | "corrupt";
    errorKind?: string;
  };
  /** A plugin validator or operation preflight threw. The error is rethrown unchanged. */
  "plugin.failure": {
    pluginId: string;
    hook: "validator" | "preflight";
    errorName: string;
  };
  /** Host-measured interaction timing, such as a drag or resize gesture. */
  "interaction.performance": {
    interaction: string;
    outcome: "committed" | "cancelled";
    frameCount?: number;
  };
  /** Host-measured document size, as counts rather than content. */
  "document.measurement": { metric: string; value: number; unit?: string };
  /** Host-measured viewport rendering performance. */
  "viewport.measurement": { metric: string; value: number; unit?: string };
};

export type EditorTelemetryEventName = keyof EditorTelemetryEventMap;

export type EditorTelemetryEvent<
  TName extends EditorTelemetryEventName = EditorTelemetryEventName,
> = {
  [Name in TName]: {
    schemaVersion: typeof editorTelemetrySchemaVersion;
    name: Name;
    /** Milliseconds since the Unix epoch. */
    timestamp: number;
    correlationId: string;
    durationMs?: number;
    attributes: EditorTelemetryEventMap[Name];
    /** Host-owned enrichment added by processors. */
    context?: Record<string, unknown>;
  };
}[TName];

export type EditorTelemetrySink = (event: EditorTelemetryEvent) => void;

/** Returns the event to deliver, a changed copy (redact/enrich), or `null` to drop it. */
export type EditorTelemetryProcessor = (event: EditorTelemetryEvent) => EditorTelemetryEvent | null;

export type EditorTelemetryEmitOptions = {
  correlationId?: string;
  durationMs?: number;
};

export type EditorTelemetry = {
  emit: <TName extends EditorTelemetryEventName>(
    name: TName,
    attributes: EditorTelemetryEventMap[TName],
    options?: EditorTelemetryEmitOptions,
  ) => void;
  /** Creates a correlation ID for a group of related events. */
  correlationId: () => string;
  /** Monotonic milliseconds for measuring durations. */
  now: () => number;
};

export type EditorTelemetryOptions = {
  sink: EditorTelemetrySink;
  processors?: readonly EditorTelemetryProcessor[];
  /** Wall-clock milliseconds for event timestamps. Defaults to `Date.now`. */
  clock?: () => number;
  /** Monotonic milliseconds for durations. Defaults to `performance.now` when available. */
  now?: () => number;
  createCorrelationId?: () => string;
  /** Receives sink and processor failures, which are otherwise swallowed. */
  onError?: (error: unknown) => void;
};

export const noopEditorTelemetrySink: EditorTelemetrySink = () => {};

export function createEditorTelemetry(options: EditorTelemetryOptions): EditorTelemetry {
  const processors = options.processors ?? [];
  const clock = options.clock ?? Date.now;
  const now = options.now ?? defaultMonotonicNow;
  const createCorrelationId = options.createCorrelationId ?? createDefaultCorrelationIdFactory();

  return {
    correlationId: () => safely(createCorrelationId, options.onError) ?? "",
    emit(name, attributes, emitOptions = {}) {
      try {
        let event: EditorTelemetryEvent | null = {
          attributes,
          correlationId: emitOptions.correlationId ?? createCorrelationId(),
          name,
          schemaVersion: editorTelemetrySchemaVersion,
          timestamp: clock(),
          ...(emitOptions.durationMs === undefined ? {} : { durationMs: emitOptions.durationMs }),
        } as EditorTelemetryEvent;
        for (const processor of processors) {
          event = processor(event);
          if (event === null) {
            return;
          }
        }
        options.sink(event);
      } catch (error) {
        safely(() => options.onError?.(error));
      }
    },
    now: () => safely(now, options.onError) ?? 0,
  };
}

/** Keeps a random `rate` (0–1) share of events. */
export function sampleEditorTelemetry(
  rate: number,
  random: () => number = Math.random,
): EditorTelemetryProcessor {
  return (event) => (random() < rate ? event : null);
}

/** Drops events whose name is not listed. */
export function filterEditorTelemetry(
  names: readonly EditorTelemetryEventName[],
): EditorTelemetryProcessor {
  const allowed = new Set<string>(names);
  return (event) => (allowed.has(event.name) ? event : null);
}

/** Merges host context, such as an app version or editor kind, into every event. */
export function enrichEditorTelemetry(
  context: Record<string, unknown> | (() => Record<string, unknown>),
): EditorTelemetryProcessor {
  return (event) => ({
    ...event,
    context: { ...event.context, ...(typeof context === "function" ? context() : context) },
  });
}

/** Collects events in memory, for tests and local debugging. */
export function createEditorTelemetryRecorder(): {
  sink: EditorTelemetrySink;
  events: EditorTelemetryEvent[];
  clear: () => void;
} {
  const events: EditorTelemetryEvent[] = [];
  return {
    clear: () => {
      events.length = 0;
    },
    events,
    sink: (event) => {
      events.push(event);
    },
  };
}

/** Emits only when the host opted in. Used by Editor Core integrations. */
export function emitEditorTelemetry<TName extends EditorTelemetryEventName>(
  telemetry: EditorTelemetry | undefined,
  name: TName,
  attributes: EditorTelemetryEventMap[TName],
  options?: EditorTelemetryEmitOptions,
): void {
  telemetry?.emit(name, attributes, options);
}

/** Counts issues by severity; issues without a severity count as errors. */
export function countEditorTelemetryIssues(issues: readonly object[]): EditorTelemetryIssueCounts {
  let warningCount = 0;
  for (const issue of issues) {
    if ((issue as { severity?: unknown }).severity === "warning") {
      warningCount += 1;
    }
  }
  return { errorCount: issues.length - warningCount, issueCount: issues.length, warningCount };
}

/** The error's name only; messages may echo document content. */
export function getEditorTelemetryErrorName(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string" && name.length > 0) {
      return name;
    }
  }
  return typeof error;
}

function defaultMonotonicNow(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function createDefaultCorrelationIdFactory(): () => string {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (randomUUID) {
    return randomUUID;
  }
  let counter = 0;
  const prefix = Date.now().toString(36);
  return () => `${prefix}-${(counter += 1).toString(36)}`;
}

function safely<TValue>(run: () => TValue, onError?: (error: unknown) => void): TValue | undefined {
  try {
    return run();
  } catch (error) {
    try {
      onError?.(error);
    } catch {
      // Telemetry must never break the editor.
    }
    return undefined;
  }
}
