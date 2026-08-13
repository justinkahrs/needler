## Why

The editor still behaves like a long page instead of a device-sized creative workspace, which is especially costly on phones and tablets where browser scrolling competes with canvas gestures. Moving primary toolbars into the canvas frame lets the sheet remain the main surface while keeping tool changes, colors, and image manipulation close to the work.

## What Changes

- Constrain the editor app shell to the current device viewport so the main workspace does not require page scrolling.
- Move the main stitch/navigation/export toolbar into the canvas workspace as a floating, collapsible toolbar similar in placement and behavior to the quick color selector.
- Keep the quick color selector inside the canvas workspace.
- Add a third canvas-hosted toolbar dedicated to image/reference manipulation when image workflows are relevant.
- Preserve inspector access for detailed settings, but avoid relying on off-canvas panels for frequent in-canvas actions.
- Ensure mobile, tablet portrait, tablet landscape, and desktop layouts do not produce horizontal or vertical document overflow during normal editing.

## Capabilities

### New Capabilities

- `editor-viewport-workspace`: Defines the viewport-locked editor shell and canvas-hosted toolbar behavior for primary tools, quick colors, and image manipulation.

### Modified Capabilities

- None.

## Impact

- Affected UI: `app/_components/NeedlepointEditor.tsx` and any focused helper components extracted from it.
- Affected styling: editor shell height/overflow rules, canvas stage layering, floating toolbar placement, and responsive controls.
- Affected behavior: tool selection, image manipulation control placement, inspector visibility, and scroll/gesture ergonomics.
- Tests/validation: browser validation for no document scroll/overflow across representative device sizes, toolbar accessibility and responsiveness, and image toolbar visibility/state when images are present.
- No expected changes to persistence, share links, `.needler` files, image local-only policy, stitch model, PDF generation, PNG exports, or DMC matching.
