## Why

Needler’s editor is already canvas-based, but iPad and iPhone performance is poor because normal gestures can trigger high-DPR backing-store reallocations and full redraws of expensive sheet details. Mobile creative work needs the stage to feel responsive while preserving the existing visual model, exports, and project data.

## What Changes

- Keep editor canvases persistently sized and only resize backing stores when viewport dimensions or render scale actually change.
- Cap interactive stage pixel ratio on high-DPR devices so iPhone/iPad redraws process fewer pixels without changing export quality.
- Cache the expensive perforated-sheet underlay and hole overlay as reusable canvas bitmaps, using OffscreenCanvas when available with a DOM canvas fallback.
- Throttle live viewport updates through `requestAnimationFrame` so pointer/gesture events cannot drive React redraws faster than the browser can paint.
- Add visible-world culling for low-risk immediate-mode stitch and preview rendering where it avoids unnecessary per-stitch work.
- Preserve the current visual output, editing behavior, persistence, sharing, PDF generation, and PNG export behavior.

## Capabilities

### New Capabilities
- `editor-rendering-performance`: Defines responsive canvas rendering behavior for the editor stage under touch, pen, mouse, and high-DPR mobile input.

### Modified Capabilities
- None.

## Impact

- Affected UI: `app/_components/NeedlepointEditor.tsx`.
- Affected behavior: editor stage render scheduling, canvas backing-store sizing, interactive canvas pixel ratio, cached sheet rendering, and visible-bounds drawing.
- Tests/validation: existing Vitest, lint, and build checks; browser smoke checks for stage rendering, gestures, reference-image controls, and responsive viewports.
- No expected changes to saved project format, share URLs, `.needler` files, print/PDF output, DMC matching, or the fixed 9 x 12 inch sheet model.
