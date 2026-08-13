## 1. Layer Model and Pure Helpers

- [x] 1.1 Add runtime stitch-layer and layered-project types to `app/_lib/needlepointTypes.ts`.
- [x] 1.2 Add pure layer selectors for all stitches, visible stitches, active layer lookup, editable active layer lookup, and layer updates.
- [x] 1.3 Add helper constructors for default projects, default layer names, duplicated layer ids, and migrated flat-stitch layers.
- [x] 1.4 Add visible-composite validation helpers for sheet bounds and maximum hole-load capacity.
- [x] 1.5 Add unit tests for layer selectors, default layer creation, flat migration helpers, and visible-composite validation.

## 2. Persistence Migration

- [x] 2.1 Add local stored-project version 4 with ordered layers, active layer id, layer names, visibility, lock state, and compact layer stitch tuples.
- [x] 2.2 Update project serialization to write version 4 layered payloads.
- [x] 2.3 Update project deserialization to read version 4 and migrate storage versions 3, 2, and legacy v1 into one visible unlocked layer.
- [x] 2.4 Update storage key fallback logic so existing saved projects still load after the version bump.
- [x] 2.5 Extend persistence tests for layered round trips, active layer restoration, hidden/locked metadata, and legacy flat migrations.

## 3. Share Links and Needler Files

- [x] 3.1 Add share/file payload version 2 that preserves layers and layer metadata.
- [x] 3.2 Update share encoding to write layered projects and include hidden and locked layers in the compressed payload.
- [x] 3.3 Update share decoding to open version 2 payloads and migrate existing version 1 flat links/files into one default layer.
- [x] 3.4 Update share validation to validate layer metadata, layer stitches, and the visible composite while preserving existing size limits.
- [x] 3.5 Extend share and `.needler` tests for layered round trips, old flat links/files, hidden layers, locked layers, active layer id, and reference-image exclusion.

## 4. Editor State and Editing Commands

- [x] 4.1 Update new-project creation, reset, project migration, shared-project open, and return-to-local flows to initialize and preserve layer state.
- [x] 4.2 Replace editor reads of `project.stitches` with explicit all-layer or visible-layer selectors according to each call site's behavior.
- [x] 4.3 Route manual stitch creation to the active visible unlocked layer and block edits when the active layer is hidden or locked.
- [x] 4.4 Route erasing through active-layer rules while preserving top-layer hit-test precedence for eligible visible layers.
- [x] 4.5 Update image-pattern application so the default additive action creates a new stitch layer, with an option to apply to the current editable layer.
- [x] 4.6 Ensure undo and redo capture layer creation, deletion, merge, reorder, visibility, lock, rename, duplicate, recolor, and transform operations.

## 5. Rendering, Capacity, and Exports

- [x] 5.1 Render visible layers in order on the stage while excluding hidden layers.
- [x] 5.2 Update dense-stitch caches and spatial hit-test indexes to account for visible layers and layer order.
- [x] 5.3 Update capacity maps, pattern fill conflict checks, stitch counts, and color usage summaries to use the intended visible or all-layer stitch set.
- [x] 5.4 Update PNG export generation to flatten only visible layers in layer order.
- [x] 5.5 Update printable PDF generation and worker inputs to flatten only visible layers while preserving color and symbol correctness.
- [x] 5.6 Add focused tests for visible flattening, hidden-layer export exclusion, layer order rendering inputs, and capacity validation.

## 6. Layer Operations, Transforms, and Recoloring

- [x] 6.1 Implement pure operations for add, select, rename, duplicate, delete, merge, reorder, hide/show, lock/unlock, and active-layer fallback.
- [x] 6.2 Implement grid-aligned move transforms with sheet-bounds and visible-capacity validation.
- [x] 6.3 Implement 90-degree layer rotation around a layer-local pivot with sheet-bounds and visible-capacity validation.
- [x] 6.4 Implement grid-aligned resize transforms that reject degenerate, out-of-bounds, or capacity-invalid results.
- [x] 6.5 Implement active-layer bulk recolor that changes only target-layer stitch color role references and keeps colorways valid.
- [x] 6.6 Add unit tests for every layer operation, invalid show/transform blocking, transform geometry, and layer-scoped recoloring.

## 7. Layer User Interface

- [x] 7.1 Add a layers panel mode or dedicated inspector section that lists layers in drawing order with active-layer selection.
- [x] 7.2 Add layer controls for create, rename, duplicate, delete, merge, reorder, hide/show, and lock/unlock using existing icon patterns.
- [x] 7.3 Add destructive confirmation for deleting populated layers and for any merge path that removes a source layer.
- [x] 7.4 Add active-layer transform controls for grid movement, 90-degree rotation, and grid-aligned resize with clear invalid-state feedback.
- [x] 7.5 Add active-layer bulk recolor controls that reuse existing palette, DMC, and color role behavior.
- [x] 7.6 Add compact stage chrome showing the active layer name and hidden/locked status near the canvas.
- [x] 7.7 Verify layer panel controls stop pointer and wheel propagation into canvas gesture handlers.
- [x] 7.8 Verify responsive layouts on phone, tablet portrait, tablet landscape, and desktop so layer controls do not overlap canvas toolbars or feedback.

## 8. Validation

- [x] 8.1 Run focused Vitest files for layer helpers, persistence, sharing, PDF generation, colorways, and needlepoint rules.
- [x] 8.2 Run `npm run lint` and fix regressions.
- [x] 8.3 Run `npm test` and fix regressions.
- [x] 8.4 Run `npm run build` and fix regressions.
- [x] 8.5 Run the dev server and validate creating, selecting, renaming, duplicating, deleting, merging, hiding/showing, locking/unlocking, and reordering layers.
- [x] 8.6 Validate manual drawing, erasing, image-pattern application, transform controls, and bulk recolor on active layers.
- [x] 8.7 Validate old local projects, old share links/files, layered local reloads, layered share links/files, PNG export, and printable PDF export.
