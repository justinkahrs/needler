## 1. Viewport Shell

- [x] 1.1 Audit the current editor shell, stage, tool rail, and panel layout classes for document overflow sources.
- [x] 1.2 Convert the editor root and workspace grid to a `100dvh`-bounded shell with `min-h-0` children and `overflow-hidden`.
- [x] 1.3 Ensure inspector, share, and colorway panels use bounded internal overflow instead of causing document scrolling.
- [x] 1.4 Preserve safe-area-aware spacing for mobile browsers.

## 2. Canvas Primary Toolbar

- [x] 2.1 Move the primary editing toolbar from the external rail into the canvas stage as an absolute overlay.
- [x] 2.2 Preserve collapse/expand behavior with a compact active-tool affordance.
- [x] 2.3 Wire stitch, erase, pan, image frame, eyedropper, undo, redo, zoom, fit, rotate, share, PNG export, PDF export, and reset controls to their existing handlers.
- [x] 2.4 Keep export busy states and reset confirmation behavior unchanged in the canvas toolbar.
- [x] 2.5 Stop pointer and wheel event propagation from toolbar controls into canvas gesture handlers.

## 3. Toolbar Overlay Layout

- [x] 3.1 Coordinate primary toolbar, quick color selector, image toolbar, progress, notice, zoom, empty-state, and status overlays so they do not incoherently overlap.
- [x] 3.2 Add responsive placement for phone, tablet portrait, tablet landscape, and desktop viewports.
- [x] 3.3 Confirm collapsed toolbar states leave enough exposed canvas area for drawing, panning, erasing, and image manipulation.

## 4. Canvas Image Toolbar

- [x] 4.1 Add a dedicated canvas-hosted image toolbar that appears when reference-image workflows are relevant.
- [x] 4.2 Include active-image selection or identification for multi-image sessions.
- [x] 4.3 Add fast active-image controls for frame mode, background eyedropper, fit/fill, opacity, rotation, removal, and pattern preview entry points.
- [x] 4.4 Keep dense pattern conversion settings in the bounded inspector while synchronizing active image state with the canvas toolbar.
- [x] 4.5 Hide or disable image controls compactly when no reference image is present.
- [x] 4.6 Stop pointer and wheel event propagation from image toolbar controls into canvas gesture handlers.

## 5. Validation

- [x] 5.1 Run `npm run lint`.
- [x] 5.2 Run `npm test`.
- [x] 5.3 Run `npm run build`.
- [x] 5.4 Use browser validation to verify document scroll dimensions match viewport dimensions on phone, tablet portrait, tablet landscape, and desktop.
- [x] 5.5 Use browser validation to verify primary toolbar, quick color selector, and image toolbar interactions do not trigger accidental canvas gestures.
- [x] 5.6 Use browser validation to verify image toolbar controls operate on the active image and preserve additive multi-image behavior.
