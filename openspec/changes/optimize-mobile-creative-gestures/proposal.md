## Why

Needler’s canvas already has the right primitives for a creative editor, but the current experience depends heavily on tool buttons and desktop-style pointer behavior. iPad users should be able to navigate, rotate, draw, erase, and frame reference images with familiar direct gestures while desktop remains efficient and comfortable.

## What Changes

- Add first-class touch and pointer gestures on the editor stage, including pinch-to-zoom, two-finger pan, two-finger rotate, double-tap zoom/focus, and direct pan behavior that coexists with the current pan tool.
- Make Apple Pencil in Safari a first-class precision input for stitch, erase, eyedropper, pan, and reference-image workflows while preserving finger gestures for canvas navigation.
- Preserve precise stitch, erase, eyedropper, and reference-image editing behavior while gestures are active, including safe cancellation of in-progress stitch or image drags when a multi-touch gesture begins.
- Improve the iPad/mobile layout so the canvas is larger by default, primary tools are collapsible, tool access stays reachable, and the inspector/share/colorway panels are usable without crowding the stage.
- Maintain desktop ergonomics with mouse wheel zoom, button controls, keyboard undo/redo, hover affordances, and a pleasant wide layout.
- Add interaction and layout validation that covers touch-capable viewport sizes and desktop regressions.

## Capabilities

### New Capabilities
- `editor-gestures`: Defines direct-manipulation gestures and responsive creative-editor behavior across Apple Pencil/pen, touch, trackpad, and mouse input.

### Modified Capabilities
- None.

## Impact

- Affected UI: `app/_components/NeedlepointEditor.tsx`, related client components if panel presentation needs adjustment, and global/mobile CSS as needed.
- Affected behavior: editor stage pointer handling, view transforms, reference-image transform controls, responsive layout, and canvas affordances.
- Tests/validation: focused Vitest coverage for gesture/view math where extracted into pure helpers, plus browser validation for iPad Safari with Apple Pencil, touch iPad-sized viewports, and desktop viewports.
- No expected changes to persistence, share URLs, `.needler` files, PDF generation, DMC matching, or the fixed sheet/stitch domain model.
