## Purpose

Defines the editor-stage gestures and responsive workspace behavior needed for Needler to feel like a native creative tool on iPad Safari with Apple Pencil while preserving an efficient desktop editing experience.

## ADDED Requirements

### Requirement: Stage supports direct viewport gestures
The editor stage SHALL support direct manipulation of the sheet viewport with touch-capable input, including pinch zoom, two-pointer pan, two-pointer rotation, and double-tap zoom/focus.

#### Scenario: Pinch zoom preserves the gesture focal point
- **WHEN** the user pinches two fingers inward or outward on the editor stage
- **THEN** the sheet zoom changes around the midpoint between the fingers without jumping away from that midpoint

#### Scenario: Two-pointer pan moves the sheet
- **WHEN** the user moves two fingers across the editor stage with roughly stable spacing and angle
- **THEN** the sheet pans by the same on-screen movement

#### Scenario: Two-pointer rotation rotates the sheet
- **WHEN** the user rotates two fingers around their midpoint on the editor stage
- **THEN** the sheet rotation changes to match the gesture angle and remains within the supported rotation range

#### Scenario: Double-tap zooms or refits
- **WHEN** the user double-taps the editor stage
- **THEN** the viewport toggles between a closer working zoom focused on the tapped point and a fitted sheet view

### Requirement: Gestures coexist with editing tools
The editor SHALL keep stitch, erase, pan, reference-image, and eyedropper tools predictable when gestures occur on the stage.

#### Scenario: Single-pointer stitch placement remains precise
- **WHEN** the stitch tool is active and the user drags from one valid hole to another with a single pointer
- **THEN** the editor previews and commits one stitch using the existing capacity rules

#### Scenario: Multi-pointer gesture cancels a pending stitch drag
- **WHEN** a second pointer touches the stage while a stitch placement drag is pending
- **THEN** the pending stitch placement is cancelled and the pointers control the viewport gesture instead

#### Scenario: Erase tool does not erase during viewport gestures
- **WHEN** the erase tool is active and the user performs a multi-pointer stage gesture
- **THEN** no stitch is removed unless the user performs a distinct single-pointer erase action

#### Scenario: Eyedropper samples only on intentional single-pointer input
- **WHEN** the eyedropper tool is active and the user performs a multi-pointer stage gesture
- **THEN** the editor does not sample a background color

### Requirement: Apple Pencil works as precision input in Safari
The editor SHALL treat Apple Pencil input in Safari as a precise editing pointer while preserving finger gestures for navigation.

#### Scenario: Pencil places stitches without page movement
- **WHEN** the user draws a stitch with Apple Pencil on the editor stage in Safari
- **THEN** the editor previews and commits the stitch without the page scrolling, zooming, or selecting text

#### Scenario: Pencil erase remains single-action
- **WHEN** the erase tool is active and the user taps or drags with Apple Pencil near an existing stitch
- **THEN** the editor removes only the intended stitch using the same hit-testing rules as mouse or touch input

#### Scenario: Pencil samples reference images intentionally
- **WHEN** the eyedropper tool is active and the user taps the reference image with Apple Pencil
- **THEN** the editor samples the tapped image color without requiring a finger gesture

#### Scenario: Pencil and finger input can be combined safely
- **WHEN** the user begins editing with Apple Pencil and then places fingers on the stage for navigation
- **THEN** the editor cancels any pending Pencil edit before starting the finger-driven viewport gesture

### Requirement: Reference image can be framed with creative gestures
When a reference image is active, the editor SHALL allow direct manipulation of the image frame without making sheet navigation inaccessible.

#### Scenario: Single-pointer image drag moves the reference image
- **WHEN** the reference-image framing tool is active and the user drags the image with one pointer
- **THEN** the reference image translates within the sheet pattern area

#### Scenario: Image pinch changes image scale
- **WHEN** the reference-image framing tool is active and the user pinches on the stage
- **THEN** the reference image scale changes around the gesture midpoint and any stale generated pattern preview is cleared

#### Scenario: View gestures remain available while framing an image
- **WHEN** the reference-image framing tool is active and the user uses the designated viewport gesture
- **THEN** the editor changes the sheet viewport rather than the image frame

### Requirement: Touch layouts prioritize a large creative surface
The editor SHALL adapt at touch-tablet and phone-sized viewports so the canvas is the dominant working area and controls remain reachable without covering essential canvas feedback.

#### Scenario: iPad portrait keeps a large working stage
- **WHEN** the app is viewed on an iPad-sized portrait viewport
- **THEN** the editor presents the stage as the largest primary region with enough visible height for useful stitch or Apple Pencil work while tool and inspector controls remain accessible

#### Scenario: iPad landscape uses available width efficiently
- **WHEN** the app is viewed on an iPad-sized landscape viewport
- **THEN** the stage, primary tools, and inspector controls are arranged to minimize unnecessary scrolling and preserve a broad canvas area

#### Scenario: Small screens avoid overlapping controls
- **WHEN** the app is viewed on a narrow touch viewport
- **THEN** toolbars, status badges, notices, and panels do not overlap each other or block active stitch feedback

### Requirement: Tool and inspector controls are collapsible
The editor SHALL let users collapse non-canvas controls on touch-tablet and desktop layouts so the canvas can occupy more space while controls remain recoverable.

#### Scenario: Primary tool rail collapses
- **WHEN** the user collapses the primary tool rail
- **THEN** the visible canvas area expands and a clear affordance remains available to reopen the tool rail

#### Scenario: Inspector panel collapses
- **WHEN** the user collapses the inspector, share, or colorway panel area
- **THEN** the visible canvas area expands and the user can restore the same panel state without losing unsaved selections

#### Scenario: Collapsed controls preserve editing mode
- **WHEN** a tool or panel is collapsed while a tool is selected
- **THEN** the selected tool remains active and visible through a compact status or reopen control

### Requirement: Desktop interactions remain efficient
The editor SHALL preserve desktop-oriented interactions while adding touch gestures.

#### Scenario: Mouse wheel zoom still works
- **WHEN** the user scrolls a mouse wheel or trackpad over the editor stage outside reference-image scaling mode
- **THEN** the sheet zooms around the cursor position

#### Scenario: Toolbar and inspector controls remain available on desktop
- **WHEN** the app is viewed on a desktop-width viewport
- **THEN** the current tool buttons, view buttons, side inspector controls, and keyboard undo/redo remain available

#### Scenario: Hover affordances remain useful with mouse input
- **WHEN** the user moves a mouse over the editor stage with stitch or erase tools active
- **THEN** the editor continues to show the relevant hole or stitch hover feedback
