## Context

See `proposal.md` for motivation. The editor is a client-only React component with a canvas stage, existing `ViewState` (`zoom`, `pan`, `rotation`), and pure screen/world transform helpers. The stage already uses pointer events, `touch-none`, wheel zoom, an explicit pan tool, and sidebar controls for sheet rotation. The target touch environment includes iPad Safari with Apple Pencil, so the stage must suppress browser page gestures inside the canvas while preserving normal page scrolling outside it. The project is statically exported, so the solution must stay browser-only and avoid server features.

## Goals / Non-Goals

**Goals:**
- Add unified pointer gesture handling for touch, pen, trackpad-equivalent wheel input, and mouse without creating a separate mobile editor.
- Treat Apple Pencil/pen input as a precise single-pointer editor input in Safari while allowing finger gestures to navigate the canvas.
- Preserve the current stitch/erase/image/eyedropper workflows while making iPad navigation feel direct and predictable.
- Reshape the responsive shell so iPad portrait and landscape keep the canvas as the primary working area, with collapsible tools and panels to make more room.
- Keep gesture math testable outside the React component where practical.

**Non-Goals:**
- No changes to the 9 x 12 inch, 14-count sheet model, stitch capacity rules, persistence, share payloads, or PDF generation.
- No server-side features or external gesture libraries.
- No free-angle reference-image rotation in this change; the image keeps its existing 90-degree rotation control unless a later spec expands the transform model.

## Decisions

1. Use a unified pointer gesture controller on the stage.

   Track active stage pointers by `pointerId`, including `pointerType`, and derive gesture frames from the current pointer set. A single pointer continues to drive existing stitch, erase, pan, image drag, and eyedropper behavior. Two active pointers start a gesture session, cancel any pending stitch/image/pan drag state, and update view or image transforms until fewer than two pointers remain.

   Rationale: the existing component already uses pointer events and canvas view transforms, so this avoids touch-event forks and keeps pen/mouse behavior consistent.

   Alternative considered: add separate `touchstart`/`touchmove` handlers. This would duplicate input state and increase the chance of divergent mobile behavior.

2. Treat Apple Pencil as precision input, not as a gesture trigger by itself.

   Use `event.pointerType === "pen"` as a high-precision single-pointer editing path for stitch placement, erase targeting, eyedropper sampling, explicit pan, and one-pointer reference-image drag. If finger pointers join while a pen edit is pending, cancel the pending edit and let the fingers control the viewport gesture. Keep pressure/tilt out of scope for now because the stitch model only tracks strand count and physical thread width.

   Rationale: Apple Pencil users expect deliberate marks, not accidental viewport gestures. Finger input remains the natural navigation channel on iPad Safari.

   Alternative considered: map Pencil pressure to strand count or thread width. That would change editing semantics and the project model, so it belongs in a separate change if needed.

3. Extract reusable transform math before wiring UI.

   Move or copy pure calculations for two-point gesture deltas into a testable helper, covering centroid, distance ratio, angle delta, focal-point-preserving zoom, and normalized rotation. React handlers should call these helpers and only own browser event state.

   Rationale: gesture regressions are hard to spot by inspection. Pure helper tests can verify the math without a DOM or browser runner.

   Alternative considered: keep all math inline in `NeedlepointEditor`. That is faster initially but makes pinch/rotate bugs harder to isolate.

4. Use focal-point-preserving view updates for pinch and rotation.

   For viewport gestures, record the gesture start view and the world point under the start centroid. On each move, compute the next zoom and rotation, then adjust `pan` so that world point remains under the current centroid. This naturally supports pinch, two-finger pan, and rotate in one update.

   Rationale: creative apps feel wrong when content slides away during pinch or rotate. The existing `screenToWorld`/`worldToScreen` helpers already support this approach.

   Alternative considered: update zoom, rotation, and pan independently from raw deltas. That is simpler but tends to drift around the gesture midpoint.

5. Classify reference-image gestures by active tool and dominant motion.

   In the reference-image tool, one pointer drags the image as it does today. A two-pointer gesture can scale the image when distance change dominates, while primarily translational or rotational two-pointer gestures continue to operate on the sheet viewport. Scaling the image clears stale pattern previews and replace confirmation just like current wheel/range scaling.

   Rationale: image framing needs direct scale control, but users still need to navigate the sheet while framing. Dominant-motion classification preserves both behaviors without adding a new mode.

   Alternative considered: make every two-finger gesture in image mode transform the image. That blocks normal canvas navigation while framing.

6. Keep desktop controls and add tablet-first responsive tiers.

   Preserve the current desktop three-column shell at wide breakpoints when controls are expanded. For tablet and narrow widths, make the stage the first visual priority, keep primary tools in a reachable horizontal rail, and present inspector/share/colorway controls in a compact panel area below or as a bottom-oriented drawer. Floating stage badges and notices should adapt to safe insets and avoid active preview feedback.

   Rationale: the current single-column layout works mechanically but pushes important controls below a large canvas and is awkward on iPad portrait. A tablet tier can improve reach without sacrificing the desktop layout.

   Alternative considered: only resize the existing columns. That does not address reachability or panel crowding on iPad.

7. Add collapsible chrome around a larger default canvas.

   Add local UI state for primary tool rail collapse and inspector/panel collapse. Collapsing the rail should keep a compact reopen affordance and expose the active tool state. Collapsing the inspector should preserve the current right-panel mode and local selections while allowing the stage to expand. On desktop, collapse should widen the canvas column; on tablet, collapse should reduce vertical chrome and leave the stage as the dominant region.

   Rationale: the user explicitly needs more canvas room, especially on iPad. Collapsing chrome is a low-risk client-only UI change because it does not alter persisted projects.

   Alternative considered: hide controls automatically by viewport size only. Manual collapse is more predictable for creative work and works on both iPad and desktop.

## Risks / Trade-offs

- Gesture recognition conflicts with stitch placement → Cancel pending single-pointer edits as soon as a second pointer joins, and only commit stitch/erase/eyedropper actions from single-pointer sessions.
- Safari handles page gestures aggressively around touch canvases → Keep `touch-action: none` on the stage, prevent default browser behavior for handled pointer/wheel gestures, and verify page scrolling still works outside the stage.
- Apple Pencil input can be misclassified or unavailable in non-Safari browsers → Use pointer events as the source of truth and fall back to the same single-pointer behavior when `pointerType` is absent.
- Reference-image gesture classification feels ambiguous → Use conservative thresholds and keep existing explicit scale and rotate controls as reliable fallbacks.
- Collapsible panel state increases JSX complexity in an already large component → Prefer small local helper components or class builders only where they reduce repeated markup.
- Canvas performance on high-DPR iPads can degrade during continuous gestures → Keep gesture updates lightweight and avoid recomputing project data during pointer moves.
- Browser validation is partly manual because no browser test dependency exists → Add Vitest coverage for math and run dev-server checks at iPad Safari with Apple Pencil, iPad portrait, iPad landscape, narrow phone, and desktop sizes during implementation.

## Migration Plan

No data migration is needed. Deploy as a client UI update; rollback is the previous static build because persisted projects and share formats are unchanged.
