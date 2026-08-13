## Purpose

Defines the editor-facing workflows that keep routine canvas actions safe, visible, and additive while preserving Needler’s local-only, static-export editing model.

## ADDED Requirements

### Requirement: Sheet reset requires destructive confirmation
The system SHALL represent sheet reset with a trash can icon wherever reset is available, and MUST require an explicit warning confirmation before clearing the sheet.

#### Scenario: User cancels sheet reset
- **WHEN** the user activates a reset control and then cancels the warning modal
- **THEN** the current project stitches, palette, colorways, reference images, view state, and editor selections remain unchanged

#### Scenario: User confirms sheet reset
- **WHEN** the user activates a reset control and confirms the warning modal
- **THEN** the system resets the sheet to a new default project, clears transient image and pattern preview state, restores default thread settings, refits the sheet view, and leaves undo available for the reset operation

### Requirement: Editor top bar is removed
The system SHALL remove the stage top bar that currently repeats the product name, sheet description, and save status above the canvas. Essential project state that remains relevant to editing MUST be available elsewhere in the workspace without reducing canvas height.

#### Scenario: Editor opens
- **WHEN** the editor workspace is rendered
- **THEN** the canvas stage begins without the product-name top bar occupying vertical space

#### Scenario: Save or temporary-copy status matters
- **WHEN** the project is loading, saved locally, or opened as a temporary shared copy
- **THEN** the user can still determine that state from workspace chrome that does not recreate the removed stage top bar

### Requirement: Export controls show active download work
The system SHALL show a spinner or equivalent busy indicator in export/download controls while PNG or printable PDF generation is in progress, and MUST prevent duplicate export requests for the same export while that work is active.

#### Scenario: PNG export is preparing
- **WHEN** the user starts a PNG export
- **THEN** every visible PNG download control shows a busy state until the browser download has been handed off or the export fails

#### Scenario: Printable PDF export is preparing
- **WHEN** the user starts a printable PDF export
- **THEN** every visible printable PDF download control shows a busy state until the PDF download has been handed off, canceled, or failed

#### Scenario: Export fails
- **WHEN** PNG or PDF export cannot complete
- **THEN** the relevant control exits its busy state and the user receives a visible warning

### Requirement: Quick color selection is a collapsible right-side bar
The system SHALL provide quick thread color selection in a collapsible bar positioned at the top-right side of the editor workspace, close to the canvas, so users can change the active stitch color without opening the full inspector.

#### Scenario: User changes the active color from the color bar
- **WHEN** the user selects a thread color from the expanded quick color bar
- **THEN** subsequent manually added stitches use that selected color role or color

#### Scenario: User collapses the color bar
- **WHEN** the user collapses the quick color bar
- **THEN** the canvas remains usable, the active color remains visible through a compact affordance, and expanding the bar restores the quick color controls without losing selection

#### Scenario: User needs full palette management
- **WHEN** the user needs to add custom colors, search the DMC library, or edit colorways
- **THEN** the full inspector workflows remain available outside the quick color bar

### Requirement: Image import is additive by default
The system SHALL treat image uploads and image-to-pattern application as additive by default. Uploading a reference image MUST NOT remove existing stitches or existing reference images, and applying an image-derived pattern MUST fill available empty cells unless the user explicitly chooses a destructive replacement action.

#### Scenario: User uploads an additional reference image
- **WHEN** the user uploads an image while another reference image is already present
- **THEN** the new image is added to the session, selected for framing, and the previous reference image remains available unless the user removes it

#### Scenario: User applies an image-derived pattern to a stitched sheet
- **WHEN** the user applies the generated pattern from an active reference image while the sheet already contains stitches
- **THEN** the system adds stitches only to eligible empty cells by default and reports any occupied-cell or capacity conflicts it skipped

#### Scenario: User explicitly replaces existing stitches with an image pattern
- **WHEN** the user chooses a clearly labeled replacement action and confirms it
- **THEN** the system may clear existing stitches before applying the active image-derived pattern

#### Scenario: User manages multiple reference images
- **WHEN** multiple reference images are present
- **THEN** the user can identify, select, frame, convert, and remove individual reference images without affecting the others

### Requirement: Reference images remain local-only
The system SHALL keep uploaded reference images local to the active browser session and MUST NOT include reference image data in share links, `.needler` files, persisted project payloads, PNG exports, or printable PDF exports unless a separate future capability explicitly changes that contract.

#### Scenario: User shares or exports a project with reference images
- **WHEN** the user shares the project, saves a `.needler` file, exports a stitched PNG, or exports a printable PDF
- **THEN** the output includes stitches, colors, colorways, and pattern artifacts as currently supported, but excludes uploaded reference image file data
