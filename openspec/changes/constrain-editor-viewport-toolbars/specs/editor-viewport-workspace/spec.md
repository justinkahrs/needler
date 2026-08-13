## Purpose

Defines the editor workspace contract for a viewport-locked canvas experience with primary editing, color selection, and reference-image manipulation controls hosted inside the canvas frame.

## ADDED Requirements

### Requirement: Editor workspace is constrained to the device viewport
The system SHALL render the main editor as a device-window-sized workspace during normal editing, without browser-level horizontal or vertical document scrolling.

#### Scenario: Editor opens on a phone
- **WHEN** the editor loads in a phone-sized viewport
- **THEN** the document does not horizontally or vertically overflow the visible device window and the canvas remains visible without page scrolling

#### Scenario: Editor opens on tablet or desktop
- **WHEN** the editor loads in tablet portrait, tablet landscape, or desktop viewport sizes
- **THEN** the main editor shell fits within the visible device window and does not require document scrolling to reach primary editing controls

#### Scenario: Detailed panels exceed available height
- **WHEN** a detailed inspector, share, or colorway panel contains more controls than fit beside the canvas
- **THEN** any overflow is contained within that panel or drawer and does not create document-level scrolling

### Requirement: Primary editing toolbar is hosted inside the canvas workspace
The system SHALL move the primary editing toolbar into the canvas workspace so common editing controls are reachable without a separate page rail.

#### Scenario: User changes tools from the canvas toolbar
- **WHEN** the user selects stitch, erase, pan, or another primary tool from the floating canvas toolbar
- **THEN** subsequent canvas interactions use the selected tool

#### Scenario: User collapses the primary toolbar
- **WHEN** the user collapses the primary editing toolbar
- **THEN** the active tool remains visible through a compact affordance and the canvas remains interactive

#### Scenario: User needs project actions
- **WHEN** the primary toolbar is expanded
- **THEN** undo, redo, zoom, fit, rotate, share, export, and reset actions remain available with the same safety and busy-state behavior as before

### Requirement: Quick color selector remains inside the canvas workspace
The system SHALL keep quick thread color selection inside the canvas workspace and coordinate its placement with other floating toolbars.

#### Scenario: User selects a color while other toolbars are visible
- **WHEN** the quick color selector and another floating toolbar are both visible
- **THEN** selecting a color updates the active stitch color without triggering canvas drawing, panning, or image manipulation

#### Scenario: Floating controls share limited mobile space
- **WHEN** the viewport is narrow or short
- **THEN** the quick color selector and other toolbars avoid incoherent overlap and can collapse into compact affordances

### Requirement: Image manipulation toolbar is hosted inside the canvas workspace
The system SHALL provide a dedicated canvas-hosted toolbar for active reference image manipulation when reference-image workflows are available.

#### Scenario: No reference image is present
- **WHEN** the editor has no uploaded reference image
- **THEN** image manipulation controls are hidden or disabled in a compact way that does not block canvas editing

#### Scenario: A reference image is active
- **WHEN** at least one reference image is active
- **THEN** the image toolbar provides fast access to image framing, background sampling, image fit/fill controls, opacity, rotation, removal, and pattern preview actions relevant to that active image

#### Scenario: Multiple reference images are present
- **WHEN** more than one reference image is available
- **THEN** the image toolbar allows the user to identify or switch the active image without losing the additive multi-image workflow

### Requirement: Canvas gestures are not blocked by floating controls
The system SHALL prevent floating toolbar interactions from leaking into canvas drawing, panning, erasing, eyedropper, or image-drag gestures.

#### Scenario: User taps a toolbar button over the canvas
- **WHEN** the user taps, clicks, drags, or wheels over a floating toolbar control
- **THEN** only the toolbar control handles the event and no unintended sheet edit or view gesture occurs

#### Scenario: User interacts outside floating controls
- **WHEN** the user starts a pointer or wheel interaction on exposed canvas area
- **THEN** the existing canvas gesture behavior remains available for the active tool
