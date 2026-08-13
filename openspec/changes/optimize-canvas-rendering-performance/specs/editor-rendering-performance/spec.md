## Purpose

Defines editor-stage rendering performance behavior so Needler remains responsive on high-DPR mobile Safari devices while preserving the canvas editor’s visual and data semantics.

## ADDED Requirements

### Requirement: Stage canvas sizing avoids unnecessary backing-store churn
The editor SHALL resize canvas backing stores only when the stage dimensions or selected render pixel ratio change.

#### Scenario: View changes reuse existing backing stores
- **WHEN** the user pans, pinches, rotates, double-taps, hovers, or drags on a stage whose displayed size has not changed
- **THEN** the editor reuses each stage canvas backing store rather than reallocating it for every frame

#### Scenario: Real viewport changes still resize correctly
- **WHEN** the stage element changes size due to orientation, layout, rail collapse, inspector collapse, or browser resize
- **THEN** each stage canvas backing store is resized to match the new displayed size and selected render pixel ratio

### Requirement: High-DPR mobile devices render the stage at a bounded pixel ratio
The editor SHALL cap interactive stage rendering pixel ratio to reduce mobile redraw cost without changing project, export, or print fidelity.

#### Scenario: iPhone and iPad use bounded stage resolution
- **WHEN** the app runs on a high-DPR touch device
- **THEN** the stage canvases render at no more than the configured interactive maximum pixel ratio

#### Scenario: Exports retain full export quality
- **WHEN** the user exports PNG or printable pattern output
- **THEN** export generation uses the existing export-specific scale and is not reduced by the interactive stage pixel-ratio cap

### Requirement: Expensive sheet rendering is cached
The editor SHALL cache reusable perforated-sheet rendering so viewport gestures do not redraw static paper fibers and holes from scratch on every frame.

#### Scenario: Static sheet details are reused during gestures
- **WHEN** the user pans, zooms, rotates, or hovers without changing the sheet model
- **THEN** the editor draws cached sheet layers instead of recomputing all static perforated-sheet details

#### Scenario: Reference image remains visually integrated
- **WHEN** a reference image is shown
- **THEN** the editor draws it between the cached sheet underlay and cached hole overlay so perforations remain visible above the image

#### Scenario: Unsupported OffscreenCanvas falls back safely
- **WHEN** OffscreenCanvas is unavailable or cannot create a 2D context
- **THEN** the editor uses an in-memory DOM canvas fallback for the same cached layers

### Requirement: Pointer-driven view updates are frame-throttled
The editor SHALL schedule high-frequency viewport updates with `requestAnimationFrame` so pointer input cannot trigger more React canvas redraws than the browser can paint.

#### Scenario: Dense pointer movement coalesces into paint frames
- **WHEN** many pointermove or wheel events arrive within one animation frame
- **THEN** the editor applies the latest view state for that frame rather than redrawing once per raw event

#### Scenario: Final view state is committed
- **WHEN** a gesture, pan, wheel zoom, or animated stage interaction ends
- **THEN** the latest view state remains reflected in React state and visible status badges

### Requirement: Drawing work is limited to visible content where practical
The editor SHALL avoid per-stitch drawing work for content outside the visible world bounds when immediate-mode rendering is used.

#### Scenario: Zoomed-in views skip offscreen stitches
- **WHEN** the user is zoomed into a portion of the sheet
- **THEN** immediate-mode stitch and preview drawing skips stitches whose endpoints are outside the padded visible world bounds

#### Scenario: Dense-pattern fallback remains correct
- **WHEN** a dense pattern uses grouped path rendering for performance
- **THEN** the editor may continue using grouped paths if it is faster than per-stitch culling and shall preserve visual correctness
