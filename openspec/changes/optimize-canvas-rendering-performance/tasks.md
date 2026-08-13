## 1. Canvas Backing Stores

- [x] 1.1 Make stage canvas preparation reuse backing stores when viewport size and render pixel ratio are unchanged.
- [x] 1.2 Add a bounded stage render pixel ratio for high-DPR touch/mobile devices without changing export scale.
- [x] 1.3 Ensure canvas resizing still responds to orientation, layout, and panel collapse changes.

## 2. Cached Sheet Rendering

- [x] 2.1 Split perforated-sheet drawing into underlay, optional reference-image middle, and overlay phases.
- [x] 2.2 Add reusable sheet-layer caches using OffscreenCanvas when available and DOM canvas fallback otherwise.
- [x] 2.3 Draw cached sheet layers in the live base stage while preserving vector drawing for exports.
- [x] 2.4 Verify reference images still render beneath holes and above the sheet underlay.

## 3. Frame-Throttled View Updates

- [x] 3.1 Keep a synchronized view ref for high-frequency gesture calculations.
- [x] 3.2 Add a `requestAnimationFrame` coalescing helper for view updates.
- [x] 3.3 Route pointer, gesture, pan, double-tap, wheel, zoom button, fit, and rotation view updates through the coalescing helper where appropriate.
- [x] 3.4 Cancel any pending animation frame on unmount.

## 4. Visible Work Reduction

- [x] 4.1 Compute padded visible world bounds from the current view and viewport.
- [x] 4.2 Skip immediate-mode stitch rendering outside visible bounds while preserving dense grouped rendering correctness.
- [x] 4.3 Skip pattern draft segment drawing outside visible bounds.

## 5. Validation

- [x] 5.1 Run `npm run lint` and fix any regressions.
- [x] 5.2 Run `npm test` and fix any regressions.
- [x] 5.3 Run `npm run build` and fix any regressions.
- [x] 5.4 Run the dev server and verify stage rendering at phone, iPad portrait, iPad landscape, and desktop viewports.
- [x] 5.5 Browser-smoke double-tap zoom, wheel zoom, collapse/restore, and reference-image controls with no console errors.
