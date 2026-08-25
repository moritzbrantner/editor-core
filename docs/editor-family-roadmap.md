# Editor family roadmap

This roadmap captures the next editor-core work after source-first development is available. It is intentionally a boundary document, not a request to build a universal editor framework.

## 1. Consolidate the generic editor kernel

Audit graph-editor, timeline-editor, layer-editor, and workflow-editor for behavior that has the same semantics across editor families.

Move or converge only these generic concerns when two or more consumers genuinely share them:

- command definitions and command diagnostics
- semantic operations and transaction history
- selection primitives
- persistence orchestration and dirty/revision state
- serialization envelopes and migrations
- validation diagnostics
- clipboard contracts
- interaction sessions
- plugin/aspect composition

Keep a domain wrapper when it changes semantics rather than merely renaming a generic helper.

### Acceptance criteria

- A migration matrix identifies each duplicate surface, its current owner, and its target owner.
- No migration introduces React into the editor-core root or headless subpaths.
- Existing specialized editors can migrate incrementally rather than in one coordinated release.
- Registry compatibility remains independently verifiable while source mode is used for coordinated development.

## 2. One canonical document, multiple projections

Extend the existing tree/aspect direction only as far as needed to let one host-owned document be edited through more than one view.

Candidate projections include:

- tree
- graph
- timeline
- layer hierarchy
- inspector
- later table/data and schema views

The projection contract must adapt a host document; it must not define a universal document ontology.

### Acceptance criteria

- Projection adapters expose stable ids so selection can survive document updates.
- A graph or timeline editor can coexist with a tree/inspector projection without duplicating source-of-truth state.
- Projection state such as viewport or expansion remains view state, not canonical document state unless the host explicitly models it.
- At least two specialized editors dogfood the contract before it is broadened.

## 3. Keep workbench chrome out of editor-core

Common visual shells belong in the UI landscape, not in the editor kernel.

Likely reusable UI primitives include:

- panes and resizers
- toolbar and command-palette shells
- inspector sections
- breadcrumbs
- diagnostics/status surfaces
- document controls

Editor-specific React packages compose those primitives with domain behavior. Do not introduce a generic `EditorWorkbench` that becomes a second application framework.

## 4. Migration order

Use this order unless dogfooding shows a better dependency sequence:

1. graph-editor as the reference consumer of current editor-core
2. layer-editor generic history/selection/command migration
3. timeline-editor generic command/history/serialization migration
4. workflow-editor cleanup after graph-editor has stabilized
5. data-editor as the first new editor family built directly on the consolidated contracts
6. schema-editor only if data-editor or another real consumer justifies it

Each migration should be independently mergeable and should prefer source-mode verification during development plus packed/registry verification before release.

## Non-goals

- no universal editor document schema
- no mega-workbench
- no mandatory orchestrator or repository ontology
- no editor execution engine in editor-core
- no abstraction justified by only one consumer
