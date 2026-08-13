## 1. Gesture Math

- [x] 1.1 Create a pure gesture/view helper in `app/_lib/` for centroid, distance, angle, zoom clamping, rotation normalization, and focal-point-preserving pan calculations.
- [x] 1.2 Add Vitest coverage for pinch zoom preserving the focal point, two-pointer pan, two-pointer rotation, zoom bounds, and rotation normalization.
- [x] 1.3 Add helper coverage for double-tap zoom target selection and fitted-view fallback behavior.

## 2. Stage Pointer Integration

- [x] 2.1 Refactor `NeedlepointEditor` stage pointer state to track active pointers by `pointerId` and identify single-pointer edit sessions versus multi-pointer gesture sessions.
- [x] 2.2 Wire two-pointer viewport gestures for pinch zoom, two-pointer pan, and two-pointer sheet rotation using the tested helper math.
- [x] 2.3 Implement double-tap stage behavior that toggles between focused working zoom and fitted sheet view.
- [x] 2.4 Ensure multi-pointer gesture start cancels pending stitch, pan, and image drags without committing edits.
- [x] 2.5 Treat Apple Pencil/pen input as a high-precision single-pointer path for stitch placement, erase targeting, eyedropper sampling, explicit pan, and reference-image drag.
- [x] 2.6 Ensure finger pointers can join after Pencil input by cancelling pending Pencil edits before starting viewport gestures.
- [x] 2.7 Preserve single-pointer stitch placement, erase, eyedropper sampling, explicit pan tool behavior, mouse wheel zoom, and keyboard undo/redo.

## 3. Reference Image Gestures

- [x] 3.1 Preserve one-pointer reference-image dragging in image framing mode.
- [x] 3.2 Add dominant-motion classification for image framing gestures so pinch-dominant motion scales the reference image and translation/rotation-dominant motion controls the sheet viewport.
- [x] 3.3 Clear generated pattern preview and replace confirmation whenever gesture-driven reference-image scale changes.
- [x] 3.4 Verify existing reference-image controls for upload, fit/fill, 90-degree rotation, scale slider, opacity, clear, and background sampling still work.

## 4. Responsive Workspace

- [x] 4.1 Rework the editor shell classes/components so iPad portrait keeps the stage first and gives it a larger, stable default height.
- [x] 4.2 Add a collapsible primary tool rail with a compact reopen affordance and visible active-tool status.
- [x] 4.3 Ensure collapsing the primary tool rail expands the visible canvas area on iPad and desktop layouts.
- [x] 4.4 Adapt inspector/share/colorway presentation for touch-tablet and narrow widths so controls can collapse without losing current panel state or selections.
- [x] 4.5 Ensure collapsing the inspector/share/colorway panel expands the visible canvas area and provides a clear restore affordance.
- [x] 4.6 Preserve the pleasant wide desktop layout with left tool rail, central stage, right inspector, and existing hover affordances when controls are expanded.
- [x] 4.7 Adjust floating stage badges, progress, and notices so they respect safe areas and do not overlap each other on narrow screens.

## 5. Validation

- [x] 5.1 Run `npm test` and fix any regressions.
- [x] 5.2 Run `npm run lint` and fix any regressions.
- [x] 5.3 Run `npm run build` and fix any regressions.
- [x] 5.4 Run the dev server and validate the editor at iPad portrait, iPad landscape, narrow phone, and desktop viewports.
- [ ] 5.5 Manually validate iPad Safari with Apple Pencil for stitch placement, erase, eyedropper sampling, explicit pan, reference-image drag, and safe transition from Pencil input to finger gestures.
- [ ] 5.6 Manually validate stitch placement, erase, eyedropper, pan tool, pinch zoom, two-finger pan, two-finger rotate, double-tap zoom, reference-image drag, reference-image pinch scale, wheel zoom, and desktop hover feedback.
- [x] 5.7 Manually validate collapsed and expanded tool rail and inspector states on iPad portrait, iPad landscape, narrow phone, and desktop viewports.
