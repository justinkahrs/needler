## Context

See `proposal.md` for motivation. The main editor is a client-only React component in `app/_components/NeedlepointEditor.tsx`. It already owns the canvas stage, tool rail, right inspector, export actions, one transient reference image, image-to-pattern worker state, and PDF worker state. Project persistence serializes stitches, colors, roles, and colorways only; reference images are intentionally local-only and currently held in React state plus an image element ref.

The app is statically exported and must remain browser-only. Dependencies already include `lucide-react`, so icon and spinner changes should use that package rather than adding UI dependencies.

## Goals / Non-Goals

**Goals:**

- Make reset visually destructive and operationally safe.
- Make export/download latency visible everywhere export actions appear.
- Give thread color changes a near-canvas, low-friction path without removing full palette management.
- Make image upload and image pattern application default to additive work.
- Support multiple local reference images without altering persisted project, share, or `.needler` formats.
- Keep the editor responsive and canvas-first after removing the top stage bar.

**Non-Goals:**

- No changes to the physical sheet model, stitch capacity rules, DMC matching algorithm, or generated PDF chart content.
- No server upload, cloud image storage, or persisted reference-image data.
- No new drag-and-drop library or UI framework dependency.
- No broad redesign of colorway studio or share panel beyond preserving entry points from the updated editor shell.

## Decisions

1. Use a local confirmation modal for reset.

   Add local UI state for a reset confirmation dialog. All reset controls open the dialog instead of calling reset immediately. Confirmation calls the existing reset behavior; cancellation only closes the dialog.

   Rationale: reset is destructive enough to warrant an explicit decision, but preserving the existing reducer-based reset keeps undo behavior and project normalization stable.

   Alternative considered: rely on browser `confirm()`. That is simpler but inconsistent with the app’s visual language and harder to validate across mobile browsers.

2. Use `Trash2` for reset and `LoaderCircle` or equivalent for busy export controls.

   Replace reset’s rotate-arrow icon with a trash can icon in both the tool rail and project panel. For exports, render a spinner inside each visible PNG/PDF control while the corresponding state is active (`exporting` for PNG and `pdfJob.status === "working"` for PDF). Keep controls disabled during the active operation.

   Rationale: this avoids new dependencies and makes the iconography match the action semantics. It also aligns toolbar and inspector controls so users do not see conflicting states.

   Alternative considered: show only toast/progress panel feedback. That misses the user’s specific request for feedback on the download button itself.

3. Remove the top stage header and relocate essential status into compact workspace chrome.

   Delete the stage header block that contains the `Needler` title, sheet description, and saved-local status. Keep temporary shared-project controls because they represent an active workflow, but render them as a compact status/action strip or floating affordance that does not restore the removed top bar. Preserve the existing zoom/rotation badge over the stage.

   Rationale: the header duplicates app identity and consumes valuable mobile canvas height. The editor should open directly into the sheet.

   Alternative considered: shrink the header. This improves height only marginally and does not address the user’s request to remove it completely.

4. Add a quick color bar as near-canvas editor chrome.

   Add local collapse state for a right-side top color bar. The expanded bar shows the active color, a compact swatch list from used colors or palette colors, and a control to open full palette/colorway management. The collapsed affordance remains visible as the active swatch. Selection updates `selectedColorId` and therefore existing stitch creation behavior.

   Rationale: the existing color state already routes through `selectedColorId`, so the color bar can reuse current selection semantics without adding persistence or changing color roles.

   Alternative considered: move the entire inspector color section. That would crowd the canvas and make DMC search/custom color workflows too heavy for quick selection.

5. Model reference images as a session-only collection with one active image.

   Replace the single `referenceImage` state with a collection plus an `activeReferenceImageId`. Each image gets an id, source data URL, display name, opacity, fit, natural dimensions, and transform. Store loaded image elements in a ref-backed map keyed by reference id. The active image drives image tool dragging, background sampling, conversion, fit/fill/rotate/opacity controls, and pattern preview generation.

   Rationale: this is the smallest model change that supports multiple pictures while preserving all current image operations for the selected image.

   Alternative considered: persist image metadata with the project. That would be misleading because file data remains local-only and unavailable in shared or restored projects.

6. Draw all reference images, operate on the active one.

   Update sheet rendering so all loaded reference images are drawn below stitches when image previews are visible. Active-image controls mutate only the selected reference. Removing an image clears related active pattern draft only when the removed image is active.

   Rationale: multiple pictures should be useful as visual overlays, but conversion and framing need one deterministic target.

   Alternative considered: show only the active image. That supports switching but does not satisfy the expectation that multiple pictures can be added to the sheet.

7. Make upload and apply additive by default.

   Allow the image file input to accept multiple files. Uploading adds each valid image to the collection, selects the newest image, and does not clear stitches or other references. In the pattern preview section, make the primary action “Add to empty cells” and call the existing fill behavior. Keep replacement as a secondary destructive action with explicit confirmation.

   Rationale: the existing `applyPatternDraft(project, draft, "fill")` behavior already supports safe additive application; the UI currently makes replacement too prominent.

   Alternative considered: remove replacement entirely. Some users may still need to rebuild a sheet from an image, so the capability stays available behind a clear destructive action.

8. Keep transient previews scoped to the active image.

   Pattern preview state can remain singular for this change, but it must be cleared when the active reference changes, the active reference transform changes, or the active reference is removed. If later work needs simultaneous previews per image, that should be a separate model change.

   Rationale: one preview at a time is easier to reason about and matches current worker behavior.

   Alternative considered: store a draft per reference image. This increases memory pressure and complexity without being necessary for the requested workflow.

## Risks / Trade-offs

- Large multi-image sessions can use significant memory → Keep images session-only, allow individual removal, and avoid storing image data in project persistence.
- The editor component is already large → Extract small local helper render functions/components only where they reduce repeated modal/export/color/image markup.
- A floating right-side color bar could overlap stage badges on narrow screens → Use responsive placement and stable dimensions; collapse into a compact swatch affordance when space is tight.
- Multiple reference images can make conversion target ambiguous → Always show one active image and clearly bind frame/convert controls to that active image.
- Changing default pattern application may surprise users who relied on replace → Keep replacement visible but secondary, destructive, and confirmed.
- Export spinner timing for PNG depends on `canvas.toBlob` callback and browser download handoff → Clear busy state only after blob creation and `downloadBlob` invocation or failure.

## Migration Plan

No data migration is required. Existing persisted projects load as before because project serialization does not include reference images or editor chrome state. Rollback is the previous static build; no stored payload needs conversion.
