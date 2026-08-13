## Context

See `proposal.md` for motivation and `specs/editor-layers/spec.md` for behavior. The current runtime `Project` stores one flat `stitches` array plus palette, color roles, colorways, and a fixed `SheetCanvas`. Local persistence is compact storage version 3, share links use `#share=v1.`, and `.needler` files use the same compact share payload. Rendering, hit testing, capacity checks, pattern application, PNG export, and PDF export all iterate the flat stitch array.

The app remains client-only and statically exported. Reference images are session-only and must stay excluded from local persisted projects, share links, `.needler` files, PNG exports, and printable PDFs.

## Goals / Non-Goals

**Goals:**

- Make stitch layers the runtime source of truth while providing focused flattening helpers for existing algorithms.
- Preserve legacy project compatibility by migrating flat stitch arrays into one default layer.
- Keep every visible stitch composite physically valid under the existing sheet bounds and maximum hole-load rules.
- Keep layer transforms committed as valid stitch geometry so exports and share files do not need a separate transform renderer.
- Keep the layer UI compact enough for the current constrained editor shell.

**Non-Goals:**

- No arbitrary-angle stitch-layer rotation in the initial implementation. Committed rotations should be hole-aligned, starting with 90-degree increments.
- No opacity, blend modes, masks, clipping groups, alpha compositing, or raster-image layer persistence.
- No change to the 9 x 12 inch, 14-count sheet model, hole count, stitch-cell count, or strand capacity.
- No server persistence, API routes, or new rendering dependency.

## Decisions

1. Store stitches nested under ordered layer records.

   Introduce a runtime layer shape with `id`, `name`, `visible`, `locked`, and `stitches`. The runtime project should also store `activeLayerId`. Treat `project.layers` as the source of truth and stop using a top-level flat `project.stitches` array for new runtime code. Add small pure helpers for `getAllStitches(project)`, `getVisibleStitches(project)`, `getLayerById(project, id)`, `getActiveLayer(project)`, and layer updates so broad call sites do not each reimplement flattening.

   Rationale: nested layers make duplication, deletion, visibility, locking, and layer-scoped transforms straightforward. Keeping layer metadata beside the stitches avoids synchronizing a separate stitch-to-layer index.

   Alternative considered: keep a flat stitch array and add `layerId` to every stitch. That can work for rendering, but layer duplicate/delete/merge transforms become repeated filter-map operations across the whole project and are easier to get wrong in undo and serialization.

2. Validate the visible composite, not every possible hidden combination.

   Hidden layers remain part of the saved project but are excluded from on-screen drawing, hit testing, PNG export, printable PDF export, and visible-composite capacity checks. Hiding is always allowed. Showing a layer, adding stitches to a visible layer, or transforming a visible layer must validate the resulting visible composite against sheet bounds and `MAX_HOLE_STRAND_UNITS`.

   Rationale: hidden layers often represent alternates or temporary construction layers. They should not block work while hidden, but the final visible design must remain stitchable.

   Alternative considered: always enforce capacity across every layer, including hidden layers. That prevents invalid states but makes hidden alternates surprisingly block visible editing.

3. Use committed geometry for layer transforms.

   Layer movement should translate every endpoint by an integer grid offset. Rotation should transform endpoints around a layer-local pivot and commit only hole-aligned results, with 90-degree increments as the initial supported rotation set. Resize should scale endpoints relative to a layer-local bounding box, snap to holes, and reject the commit if any stitch degenerates, leaves the sheet, or creates a visible capacity conflict. Transform preview can be visual, but the saved result should be transformed stitch coordinates, not a persistent affine transform.

   Rationale: Needler outputs physical stitch instructions. Persisting arbitrary transform matrices would let a project render positions that are not valid sheet holes and would complicate PDF symbol maps, share validation, and capacity rules.

   Alternative considered: store CSS/canvas-style transform metadata per layer and apply it at render/export time. That matches graphics apps but conflicts with the physical hole grid unless every downstream consumer implements snapping and validation.

4. Route editing through an explicit active editable layer.

   Manual stitch creation, erasing, pattern fill, bulk recolor, and transforms should all resolve an active layer first. If the active layer is hidden or locked, the command should fail early with a visible notice and leave the project unchanged. Pattern application should offer a clear target: default to creating a new stitch layer from the active image pattern, with an option to apply to the current editable layer for users who want to combine content.

   Rationale: an explicit active layer is the least surprising model for users coming from Procreate/Photoshop and prevents accidental edits across the whole design.

   Alternative considered: let tools operate on the topmost hit-tested layer regardless of active selection. That can feel convenient for erasing but makes drawing and transforms unpredictable.

5. Keep colorways global and implement layer recolor by changing stitch role references.

   Layer-level recolor should replace the color-role references of stitches in the target layer, creating or reusing color roles as needed. Existing colorways continue to map role ids to palette colors globally. Do not implement layer tint or display-only color overrides in this change.

   Rationale: Needler's exported pattern needs concrete thread roles per stitch. Display-only layer tints would not produce clear DMC/PDF instructions and would conflict with existing colorway behavior.

   Alternative considered: add a layer-level color override/tint. That is attractive for quick previews but introduces ambiguity between visible color, original thread role, colorway mapping, and printed instructions.

6. Add a new persistence and share payload version.

   Add a local stored project version that encodes layers and `activeLayerId`, while retaining decoders for storage versions 3, 2, and legacy v1 flat projects. Use a new share/file payload version for layered projects and keep the existing v1 decoder path to migrate older share links/files into one layer. The encoded layered payload should include hidden and locked layer metadata even though exports flatten only visible layers.

   Rationale: layers are externally observable project data. Trying to squeeze them into the v1 flat share format would lose layer metadata or require ambiguous conventions.

   Alternative considered: encode only the visible composite for share links and `.needler` files. That preserves old consumers but fails the user need to modify layers independently after sharing or saving.

7. Flatten visible layers at boundaries that already expect stitch arrays.

   Rendering, dense-stitch caching, hit-testing, capacity maps, PNG export, PDF generation, share validation, pattern fill conflict checks, and color usage summaries should consume explicit flattened arrays. Prefer helper names that make the choice clear, such as visible-only versus all-layers. Caches that currently use `project.stitches` identity should key on the layer collection or the flattened visible array.

   Rationale: this keeps the first implementation scoped. The domain algorithms can remain mostly stitch-array based while the editor state becomes layered.

   Alternative considered: refactor every domain function to understand layers directly. That may be cleaner long term, but it increases risk across PDF, sharing, and pattern conversion in one change.

8. Add layers as a first-class right-panel mode with compact stage status.

   Add a `layers` mode alongside inspector, colorways, and share, or a dedicated layers section in the existing inspector if the panel budget is tighter during implementation. Use existing `lucide-react` icons for add, duplicate, trash, eye, eye-off, lock, unlock, and reorder affordances. The canvas stage should expose the active layer name/status in compact chrome so users can see when they are drawing onto a hidden/locked or non-default layer.

   Rationale: layers are a primary workflow and need to be reachable without burying them under color controls. Keeping them in existing panel chrome avoids adding another floating panel that can overlap the canvas.

   Alternative considered: place a Photoshop-style floating layers palette over the canvas. That saves panel space but increases overlap risk on tablet and phone layouts.

9. Keep undo/redo as project snapshots unless implementation pressure proves otherwise.

   The existing undo model stores project snapshots. Layer operations can push complete project states just like stitch edits, resets, and pattern applications. If performance becomes unacceptable for very dense projects, optimize snapshots later with structural sharing or command patches.

   Rationale: snapshot history is already established and lowers correctness risk for a broad project model change.

   Alternative considered: add a command-based undo system now. That would be useful eventually, but it is an orthogonal architecture change.

## Risks / Trade-offs

- Broad flat-array assumptions remain in the editor -> Mitigation: add helper selectors first, migrate call sites deliberately, and cover flattening behavior with unit tests.
- Hidden layers can contain conflicts with visible layers -> Mitigation: validate whenever a hidden layer is shown and keep exports limited to the valid visible composite.
- Resize can create degenerate or overlapping stitches -> Mitigation: block unsafe commits with an explanatory notice rather than clipping or silently dropping stitches.
- Layer UI can crowd the existing right panel -> Mitigation: make rows dense, use icon buttons with accessible names, keep destructive confirmations modal-based, and verify phone/tablet/desktop layouts.
- New share format increases URL size -> Mitigation: preserve the existing dense-grid optimization for single visible composites where possible and compress all payloads before transport.
- Multiple serialization paths can drift -> Mitigation: add round-trip tests for flat migration, layered persistence, layered share links, `.needler` files, hidden layers, locked layers, and active layer restoration.

## Migration Plan

1. Add the new runtime layer types and helper selectors while retaining decode support for flat projects.
2. Change new-project creation to initialize one visible unlocked layer.
3. Add local storage version 4 using the existing storage key fallback pattern, and migrate storage versions 3, 2, and legacy v1 into one default layer.
4. Add share/file payload version 2 for layered projects, leaving the existing v1 decoder intact.
5. Route editor actions, rendering, and exports through visible/all-layer helpers until no runtime code depends on top-level `project.stitches`.
6. Rollback is the previous static build. Existing flat local projects and share links remain readable by both old and new builds; layered projects require the new build to preserve layer metadata.
