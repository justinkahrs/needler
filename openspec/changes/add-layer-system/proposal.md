## Why

Needler currently treats the design as one flat stitch list, so users cannot isolate imported patterns, manual details, alternates, or cleanup work the way they can in Procreate or Photoshop. A layer model will let users edit, transform, hide, and reorder groups of stitches independently while preserving Needler's fixed physical sheet constraints.

## What Changes

- Add a persisted stitch-layer model with ordered layers, an active layer, names, visibility, and lock state.
- Route manual stitching, erasing, selection, image-pattern application, undo/redo, rendering, PNG export, PDF export, share links, and `.needler` files through the layered project model.
- Add layer controls for creating, renaming, duplicating, deleting, locking, hiding/showing, reordering, selecting, merging, and applying layer-level edits.
- Add grid-aware layer transforms for placement, rotation, and sizing so transformed stitches remain valid on the 9 x 12 inch, 14-count sheet.
- Add bulk recolor controls for the active layer without changing unrelated layers or global colorway behavior.
- Migrate legacy flat-stitch projects, local storage, share links, and `.needler` files into a single visible default layer.
- Keep uploaded reference images local-only; image-pattern results can become stitch layers, but image file data remains excluded from persisted/share/export payloads.

## Capabilities

### New Capabilities

- `editor-layers`: Defines layered stitch editing, layer ordering/visibility, layer-scoped modifications, grid-aware transforms, and compatibility with persistence, sharing, and exports.

### Modified Capabilities

- None. No main specs are currently archived under `openspec/specs/`.

## Impact

- Affected code: `app/_lib/needlepointTypes.ts`, `app/_lib/persistence.ts`, `app/_lib/shareProject.ts`, `app/_lib/needlepointRules.ts`, `app/_lib/patternPdf.ts`, `app/_lib/colorways.ts`, relevant tests, and the `NeedlepointEditor`, `ColorwayStudio`, and `ShareProjectPanel` components.
- Data formats: add a new local-storage serialization version and a new share/`.needler` payload version while retaining decoders for existing flat projects.
- Rendering/export: visible stitch layers flatten in layer order for canvas rendering, PNG export, and printable PDF output.
- Dependencies: no new runtime dependency is expected; use existing React, TypeScript, Tailwind CSS, Vitest, `lucide-react`, and browser APIs.
