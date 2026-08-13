## Purpose

Defines Needler's layer-based stitch editing behavior so users can isolate, reorder, hide, transform, and recolor parts of a needlepoint design while keeping the visible stitched composite physically valid.

## ADDED Requirements

### Requirement: Projects contain ordered stitch layers
The system SHALL represent stitch content as one or more ordered stitch layers, with exactly one active layer for layer-scoped editing.

#### Scenario: New project starts with one active layer
- **WHEN** the user starts a new project
- **THEN** the project contains one visible, unlocked, active stitch layer with an empty stitch list

#### Scenario: Legacy flat project opens as one layer
- **WHEN** the user opens a legacy project from local storage, a share link, or a `.needler` file that contains a flat stitch list
- **THEN** the system migrates all stitches into one visible, unlocked, active layer while preserving stitch geometry, stitch order, color roles, palette colors, colorways, and the fixed sheet model

#### Scenario: Project always keeps a usable layer
- **WHEN** the user deletes or merges layers
- **THEN** the project retains at least one stitch layer and assigns the active layer to an existing layer

### Requirement: Layer list supports expected layer management
The editor SHALL provide layer controls for creating, selecting, naming, duplicating, deleting, merging, hiding, showing, locking, unlocking, and reordering stitch layers.

#### Scenario: User creates a layer
- **WHEN** the user activates the add-layer control
- **THEN** the editor creates a new visible, unlocked stitch layer, selects it as the active layer, and preserves all existing layers unchanged

#### Scenario: User reorders layers
- **WHEN** the user moves a layer above or below another layer in the layer list
- **THEN** the visible composite, hit testing, PNG export, and printable PDF export use the new layer order

#### Scenario: User duplicates a layer
- **WHEN** the user duplicates an existing layer
- **THEN** the editor creates a new layer with copied stitches and layer metadata that can be edited independently of the original layer

#### Scenario: User deletes a populated layer
- **WHEN** the user deletes a layer that contains stitches
- **THEN** the editor requires destructive confirmation before removing that layer's stitches from the project

#### Scenario: User merges layers
- **WHEN** the user merges one layer into another
- **THEN** the destination layer contains the merged stitch content in layer order and the source layer is removed without changing unrelated layers

### Requirement: Editing targets the active editable layer
The editor SHALL route stitch creation, erasing, image-pattern application, and layer-level modifications to the active layer when that layer is visible and unlocked.

#### Scenario: User draws on an editable active layer
- **WHEN** the user creates a manual stitch with a visible, unlocked active layer
- **THEN** the new stitch is appended to the active layer and no other layer's stitch list changes

#### Scenario: User erases on an editable active layer
- **WHEN** the erase tool removes a stitch while a visible, unlocked layer is active
- **THEN** the editor removes a matching stitch from the active layer only

#### Scenario: Active layer is hidden or locked
- **WHEN** the active layer is hidden or locked and the user attempts to draw, erase, transform, or recolor layer content
- **THEN** the editor prevents the edit and prompts the user to show, unlock, or select an editable layer

#### Scenario: Image pattern becomes layer content
- **WHEN** the user applies a generated image pattern using the default additive action
- **THEN** the editor creates or updates stitch content in the chosen target layer without clearing unrelated layers

### Requirement: Visibility controls the visible composite
The editor SHALL include only visible stitch layers in the on-screen stitched composite, layer hit testing, exported PNGs, and printable PDFs.

#### Scenario: User hides a layer
- **WHEN** the user hides a visible layer
- **THEN** that layer remains saved in the project but its stitches are removed from the visible composite and from newly generated PNG or printable PDF exports

#### Scenario: User shows a hidden layer
- **WHEN** the user shows a hidden layer
- **THEN** the editor includes that layer in the visible composite according to layer order if the resulting visible composite remains physically valid

#### Scenario: Showing a layer would exceed capacity
- **WHEN** showing a hidden layer would cause any hole in the visible composite to exceed the maximum strand-unit load
- **THEN** the editor keeps the layer hidden and reports the capacity conflict without modifying other layers

### Requirement: Layer order controls drawing and selection precedence
The editor SHALL render visible stitch layers in order and SHALL prefer higher visible layers when selecting or hit-testing overlapping stitches.

#### Scenario: Visible layers overlap
- **WHEN** two visible layers contain stitches near the same pointer location
- **THEN** the editor selects or erases the matching stitch from the highest eligible layer according to the layer order and active-layer editing rules

#### Scenario: Hidden layers overlap visible layers
- **WHEN** a hidden layer contains stitches near the pointer location
- **THEN** the hidden layer does not participate in hit testing until it is shown

### Requirement: Layer transforms remain grid-aware
The editor SHALL let users move, rotate, and resize a stitch layer independently while ensuring committed stitches remain aligned to valid sheet holes.

#### Scenario: User moves a layer
- **WHEN** the user moves a layer by a grid-aligned offset
- **THEN** every stitch in that layer moves by the same offset and the editor commits the change only if all resulting stitches remain within the sheet and the visible composite remains physically valid

#### Scenario: User rotates a layer
- **WHEN** the user rotates a stitch layer
- **THEN** the editor commits a hole-aligned rotated result and leaves unrelated layers unchanged

#### Scenario: User resizes a layer
- **WHEN** the user resizes a stitch layer
- **THEN** the editor commits a grid-aligned resized result that preserves valid stitch endpoints and leaves unrelated layers unchanged

#### Scenario: Transform cannot be committed safely
- **WHEN** a move, rotation, or resize would place stitches outside the sheet or violate visible-composite capacity
- **THEN** the editor blocks the commit, keeps the layer unchanged, and reports the reason to the user

### Requirement: Layer color edits are scoped
The editor SHALL let users recolor the active layer without changing unrelated layers.

#### Scenario: User recolors a single-color layer
- **WHEN** the user changes the active layer to a different thread color
- **THEN** the stitches in that layer use the selected color role or an equivalent new role, and stitches in other layers retain their existing color roles

#### Scenario: User recolors a multicolor layer
- **WHEN** the active layer contains multiple color roles and the user applies a bulk recolor
- **THEN** the editor replaces only that layer's stitch color references according to the chosen recolor action and preserves unrelated layers

#### Scenario: Colorways remain valid
- **WHEN** a project with layers switches, creates, or edits a colorway
- **THEN** colorway assignments continue to remap color roles across the project without merging layers or changing layer order, visibility, or lock state

### Requirement: Layer operations are undoable
The editor SHALL include layer operations in the existing undo and redo history.

#### Scenario: User undoes a layer transform
- **WHEN** the user transforms a layer and then activates undo
- **THEN** the active project returns to the previous layer geometry, active layer, visibility, order, and color state

#### Scenario: User redoes a layer management operation
- **WHEN** the user undoes a layer creation, deletion, merge, reorder, visibility change, lock change, rename, duplicate, recolor, or transform and then activates redo
- **THEN** the editor reapplies that layer operation exactly once

### Requirement: Layered projects persist and share compatibly
The system SHALL preserve stitch layers and layer metadata in local storage, share links, and `.needler` files while continuing to open existing flat project formats.

#### Scenario: User reloads a layered local project
- **WHEN** the user reloads the app after saving a project with multiple layers
- **THEN** all layer names, order, visibility, lock state, active layer, stitches, palette colors, color roles, and colorways are restored

#### Scenario: User opens a layered share link or file
- **WHEN** the user opens a share link or `.needler` file created from a layered project
- **THEN** the project opens with the same stitch layers, layer metadata, colors, colorways, and sheet rotation that were encoded

#### Scenario: User opens an older share link or file
- **WHEN** the user opens a supported older flat share link or `.needler` file
- **THEN** the project opens successfully with the flat stitch content migrated into one visible, unlocked layer

#### Scenario: User shares a project with reference images
- **WHEN** the user shares or saves a project that has uploaded reference images and stitch layers
- **THEN** the output includes stitch layers and layer metadata but excludes uploaded reference image file data
