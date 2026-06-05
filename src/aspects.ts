export type EditorChangeOrigin = {
  actorId?: string;
  clientId?: string;
  source?: string;
  timestamp?: string;
  transactionId?: string;
  metadata?: Record<string, unknown>;
};

export type EditorAspectContext<TDocument> = {
  document: TDocument;
  origin?: EditorChangeOrigin;
  revision: number;
};

export type EditorAspectDefinition<TDocument, TValue> = {
  id: string;
  label?: string;
  derive: (context: EditorAspectContext<TDocument>) => TValue;
  equals?(left: TValue, right: TValue): boolean;
};

export type EditorResolvedAspect<TValue> = {
  id: string;
  label?: string;
  value: TValue;
  changed: boolean;
};

export type ResolveEditorAspectsOptions<TDocument> = {
  origin?: EditorChangeOrigin;
  previous?: EditorAspectSnapshot<TDocument>;
  revision?: number;
};

export type EditorAspectSnapshot<TDocument> = {
  document: TDocument;
  origin?: EditorChangeOrigin;
  revision: number;
  aspects: Record<string, EditorResolvedAspect<unknown>>;
};

export function createEditorAspect<TDocument, TValue>(
  definition: EditorAspectDefinition<TDocument, TValue>,
): EditorAspectDefinition<TDocument, TValue> {
  return definition;
}

export function resolveEditorAspects<TDocument>(
  document: TDocument,
  definitions: readonly EditorAspectDefinition<TDocument, unknown>[],
  options: ResolveEditorAspectsOptions<TDocument> = {},
): EditorAspectSnapshot<TDocument> {
  const revision = options.revision ?? (options.previous ? options.previous.revision + 1 : 0);
  const context: EditorAspectContext<TDocument> = {
    document,
    origin: options.origin,
    revision,
  };
  const aspects: Record<string, EditorResolvedAspect<unknown>> = {};

  for (const definition of definitions) {
    if (definition.id in aspects) {
      throw new Error(`Duplicate editor aspect id "${definition.id}".`);
    }

    const value = definition.derive(context);
    const previous = options.previous?.aspects[definition.id];
    const equals = definition.equals ?? Object.is;

    aspects[definition.id] = {
      id: definition.id,
      label: definition.label,
      value,
      changed: !previous || !equals(previous.value, value),
    };
  }

  return {
    aspects,
    document,
    origin: options.origin,
    revision,
  };
}

export function getEditorResolvedAspect<TValue>(
  snapshot: EditorAspectSnapshot<unknown>,
  id: string,
): EditorResolvedAspect<TValue> | null {
  return (snapshot.aspects[id] as EditorResolvedAspect<TValue> | undefined) ?? null;
}
