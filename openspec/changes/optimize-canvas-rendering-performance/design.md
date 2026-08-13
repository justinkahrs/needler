## Context

Needler already renders the stage with three stacked 2D canvases: base sheet/reference image, committed stitches, and transient preview/hover state. Recent mobile gesture work increased the amount of continuous viewport movement on iPad and iPhone, exposing that each view update can resize high-DPR canvas backing stores and redraw the full perforated sheet, including more than 21,000 hole glyphs.

## Goals / Non-Goals

**Goals:**
- Reduce work performed during pointer, wheel, pan, pinch, rotate, hover, and image-framing moves.
- Keep the existing layered canvas architecture.
- Improve high-DPR mobile Safari responsiveness without reducing export or print output quality.
- Preserve current visual ordering: paper underlay, reference image, perforation/hole overlay, stitches, preview feedback.
- Use OffscreenCanvas as a progressive cache target, not as a hard requirement.

**Non-Goals:**
- No switch to WebGL or a third-party rendering engine in this change.
- No change to project persistence, share/export payloads, PDF generation, pattern conversion, or sheet dimensions.
- No new device-specific UI settings unless performance still needs user-facing quality controls later.
- No worker-based renderer unless main-thread caching and scheduling are insufficient.

## Decisions

1. Keep the three visible stage canvases.

   The existing layer split is useful: base sheet/reference, stitches, and preview can invalidate independently. A single canvas would increase redraw coupling. The optimization should make each layer cheaper and less eager rather than flattening the architecture.

2. Make canvas preparation idempotent.

   `prepareCanvas` should set `width` and `height` only when the CSS size or render scale changes. For normal redraws, it should reset the transform, clear, and reuse the existing backing store.

3. Bound stage pixel ratio separately from export scale.

   Interactive canvas fidelity and export fidelity solve different problems. A capped stage render scale, initially `min(devicePixelRatio, 2)`, substantially reduces iPhone/iPad pixel work while leaving export canvases and PDFs unchanged.

4. Cache static sheet layers in world coordinates.

   Split perforated-sheet rendering into underlay and overlay phases:
   - underlay: sheet shadow, paper fill, and fiber gradient
   - dynamic middle: optional reference image
   - overlay: subtle fiber lines, hole fills/strokes, and sheet border

   Cache underlay and overlay as world-space bitmaps with a small margin for shadow. Draw cached layers through the existing viewport transform. Use `OffscreenCanvas` when supported; otherwise allocate an in-memory `<canvas>`.

5. Frame-throttle live view writes.

   Maintain a `viewRef` with the latest view. High-frequency input paths update that ref and schedule one `setView` per animation frame. Lower-frequency controls can still use the same helper for consistency. Gesture math should read from the ref where stale React closures could hurt precision.

6. Add conservative visible-world culling.

   Compute a padded visible world rectangle from the viewport corners and current view. Use it to skip immediate-mode stitches and pattern draft segments outside the rectangle. Keep dense Path2D grouped drawing for large projects because a single grouped stroke can still outperform per-stitch filtering.

## Risks / Trade-offs

- Cached sheet layers may look slightly softer at very high zoom because they are world-space bitmaps. This is acceptable for interactive performance; exports retain vector-quality drawing.
- OffscreenCanvas support varies on old Safari versions. The cache allocation must fall back to DOM canvas without changing behavior.
- Capping DPR trades some stage sharpness for responsiveness. A max of 2 keeps Retina-like quality while avoiding DPR 3 redraw cost.
- Frame-throttled view state can expose stale closure bugs. Keep `viewRef` synchronized and use it in pointer paths that compute from the current view.
- Cached layers consume memory. Use two static caches at logical world resolution with a margin, avoid high-DPR world caches, and invalidate only by sheet canvas object.

## Validation Plan

- Run `npm run lint`, `npm test`, and `npm run build`.
- Use the dev server and Playwright to verify the stage renders at phone, iPad portrait, iPad landscape, and desktop sizes.
- Smoke-test double-tap zoom, wheel zoom, collapse/restore, and reference-image upload/framing controls.
- Inspect browser console for errors.
