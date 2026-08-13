## 1. Reset and Export Safety

- [x] 1.1 Import and use trash/spinner icons from existing `lucide-react` dependency.
- [x] 1.2 Replace every visible reset icon with a trash can while preserving reset labels and accessibility names.
- [x] 1.3 Add reset confirmation modal state and markup with cancel and destructive confirm actions.
- [x] 1.4 Route all reset controls through the confirmation modal and keep the existing reset behavior behind confirm.
- [x] 1.5 Add spinner/busy rendering to every visible PNG export control while PNG export is preparing.
- [x] 1.6 Add spinner/busy rendering to every visible printable PDF export control while PDF export is preparing.
- [x] 1.7 Ensure export controls are disabled during their active export and return to normal after success, failure, or cancellation.

## 2. Editor Chrome and Color Bar

- [x] 2.1 Remove the stage top bar containing the Needler title, sheet description, and saved-local status.
- [x] 2.2 Preserve loading/saved/temporary-copy state in compact workspace chrome that does not restore the removed top bar.
- [x] 2.3 Add local collapse state for a top-right quick color bar.
- [x] 2.4 Render the expanded quick color bar near the canvas with active swatch, compact color options, and a full color management entry point.
- [x] 2.5 Render the collapsed quick color affordance with the active swatch and restore action.
- [x] 2.6 Wire quick color selection to `selectedColorId` so new manual stitches use the selected color.
- [x] 2.7 Verify the full inspector still supports DMC search, custom colors, colorway editing, and sheet realism controls.

## 3. Multi-Image Reference Model

- [x] 3.1 Replace single reference-image state with a session-only reference image collection and active image id.
- [x] 3.2 Replace the single image element ref with a ref-backed map keyed by reference image id.
- [x] 3.3 Load natural dimensions per reference image and report load failures without affecting other images.
- [x] 3.4 Update derived active-reference values for image tool enablement, background sampling, framing, and conversion.
- [x] 3.5 Update pointer, wheel, gesture, fit/fill, rotate, opacity, and clear handlers to mutate only the active reference image.
- [x] 3.6 Ensure reset, shared-project open, return-to-local, and reference removal clear image/pattern state only as required by the spec.

## 4. Additive Image Workflow

- [x] 4.1 Allow the image upload input to accept multiple image files in one selection.
- [x] 4.2 Add each valid uploaded image to the session without removing existing stitches or reference images.
- [x] 4.3 Select the newest uploaded image for framing and conversion after upload.
- [x] 4.4 Draw all loaded reference images under stitches when image previews are visible.
- [x] 4.5 Add reference image list controls for selecting, identifying, framing, converting, and removing individual images.
- [x] 4.6 Make the primary pattern application action add/fill empty cells by default.
- [x] 4.7 Keep replacement as a secondary destructive action with explicit confirmation.
- [x] 4.8 Clear stale pattern preview state when the active image changes, active image transform changes, or active image is removed.
- [x] 4.9 Confirm reference images remain excluded from persistence, share, `.needler`, PNG, and printable PDF outputs.

## 5. Validation

- [x] 5.1 Add focused unit coverage for any extracted reference-image collection helper logic.
- [x] 5.2 Run `npm run lint` and fix regressions.
- [x] 5.3 Run `npm test` and fix regressions.
- [x] 5.4 Run `npm run build` and fix regressions.
- [x] 5.5 Run the dev server and validate reset cancel/confirm, PNG busy state, PDF busy/cancel state, color bar collapse/selection, and top-bar removal.
- [x] 5.6 Validate uploading multiple reference images, switching active image, framing/removing individual images, additive fill application, and explicit replacement.
- [x] 5.7 Validate responsive layouts on narrow phone, tablet portrait, tablet landscape, and desktop so color bar, stage badges, tool rail, and inspector do not overlap.
