## Why

Needler’s editor chrome currently makes routine creative actions slower than they need to be: reset is too easy to trigger accidentally, export progress is inconsistent, thread colors are buried in the inspector, and image import reads as a replace-oriented workflow. These changes make the canvas feel safer and more additive without changing the underlying stitch model.

## What Changes

- Remove the top stage bar so the canvas starts immediately after the workspace chrome and gains vertical room.
- Replace reset’s rotate-arrow icon with a trash can icon everywhere reset appears.
- Require a warning confirmation modal before resetting the sheet, with clear cancel and destructive confirm actions.
- Add visible loading spinner states while PNG and printable PDF downloads are being prepared, including disabled duplicate export actions while work is in progress.
- Move quick thread selection into a collapsible right-side top color bar that stays near the canvas, while keeping deeper palette/library management available in the inspector.
- Simplify image import so adding an image is framed as additive by default: users can upload multiple images in sequence and applying a generated pattern fills empty cells rather than replacing existing stitches unless they explicitly choose a destructive replacement action.
- Keep image references local-only and out of share/export payloads.

## Capabilities

### New Capabilities

- `editor-workflows`: Defines safer reset/export behavior, top-level editor chrome, quick color selection placement, and additive reference-image import/application workflows.

### Modified Capabilities

- None.

## Impact

- Affected UI: `app/_components/NeedlepointEditor.tsx` and any small helper components introduced to keep the editor JSX manageable.
- Affected behavior: reset confirmation, export/download busy states, responsive editor chrome, color picker placement, reference-image list/selection, and image-to-pattern apply defaults.
- Affected browser storage: local project persistence remains unchanged; reference images remain session-local and are not serialized.
- Tests/validation: focused Vitest coverage for any extracted image/reference helper logic, plus browser validation for reset modal, export loading states, color bar collapse/selection, and additive multi-image workflows.
- No expected changes to the fixed 9 x 12 inch sheet model, stitch capacity rules, share URLs, `.needler` files, DMC matching rules, or PDF chart semantics.
