## Context

See `proposal.md` for motivation. The main editor is a client component in `app/_components/NeedlepointEditor.tsx`. It currently renders a page-height grid with an external tool rail, central stage, and right-side inspector/share/colorway panels. The canvas stage already hosts several overlays, including the quick color selector, progress badge, empty-state badge, notice, zoom/rotation badge, and editor status. The app uses Tailwind CSS 4 and `lucide-react`; no new UI dependency is needed.

The workspace must remain compatible with static export and browser-only storage. Reference images stay local-only, and the physical canvas model is unchanged.

## Goals / Non-Goals

**Goals:**

- Make the editor document fit inside `100dvh` and prevent page-level scrolling during normal editing.
- Move the primary tool rail into the stage as a floating canvas toolbar with collapsed and expanded states.
- Preserve quick color selection as a stage-hosted control and prevent it from colliding with the new toolbar layout.
- Add a stage-hosted image toolbar for active reference-image operations.
- Keep detailed inspector/share/colorway workflows reachable without making the document scroll.
- Preserve existing export busy states, reset confirmation, undo/redo, image-additive behavior, and keyboard/pointer ergonomics.

**Non-Goals:**

- No changes to the project persistence or share/export payload formats.
- No server-side changes, runtime Next.js features, or API routes.
- No new icon, animation, gesture, or drawer dependency.
- No rewrite of the rendering pipeline or stitch geometry model.

## Decisions

1. Use a viewport-locked root shell with contained overflow.

   Replace the page-like `min-h-[100dvh]` workspace with a fixed-height editor shell using `h-[100dvh]`, `max-h-[100dvh]`, `overflow-hidden`, and safe-area-aware padding. The central stage should consume remaining height with `min-h-0` so children can shrink correctly. Expanded detail panels can scroll internally with `overflow-auto`, but the document body must not become the scroll container.

   Rationale: `100dvh` is stable on mobile browser chrome changes and directly matches the user’s device-window requirement.

   Alternative considered: keep `min-h-[100dvh]` and reduce panel heights. That still allows document overflow when toolbars, shared-project strips, or inspector content exceed the viewport.

2. Make the canvas stage the command surface.

   Remove the external left/bottom tool rail from the grid and render the same primary actions inside the stage as a floating toolbar. Keep the existing `toolRailCollapsed` state, but reinterpret it as the canvas toolbar collapse state. On larger screens, the toolbar can sit near the top-left or left edge of the stage; on narrow screens, it should compress into a bottom or side-safe layout that does not cover the quick color bar.

   Rationale: this keeps actions near the canvas and removes one whole layout column/row from the document flow.

   Alternative considered: use a global app footer toolbar outside the canvas. That would still consume viewport height and compete with mobile browser controls.

3. Use a small overlay layout system for stage toolbars.

   Define predictable stage overlay zones for primary tools, quick colors, image tools, status/progress, and zoom. Prefer stable sizes, compact icon buttons, and collapse affordances over large floating panels. All interactive overlay containers must stop pointer and wheel propagation before events reach the stage handlers.

   Rationale: the stage already has many absolute overlays; explicit zones reduce accidental overlap and prevent toolbar clicks from drawing stitches.

   Alternative considered: manually tune each absolute `top/right/bottom` value in place. That works initially but becomes brittle as a third toolbar is added.

4. Keep image controls split between quick toolbar and detailed inspector.

   The image toolbar should expose fast, spatial operations: enable frame/image tool, enable background eyedropper, fit/fill image, rotate image, opacity, remove active image, switch active image when multiple exist, and generate preview/apply entry points if space allows. Deeper pattern settings such as max colors, tolerance, preview palette lists, and replacement confirmation can remain in the bounded inspector panel.

   Rationale: image manipulation needs to be near the image, but pattern conversion settings are too dense for a small canvas toolbar.

   Alternative considered: move the entire image-to-pattern inspector into the canvas. That would create a large panel over the work area and make the no-overlap requirement harder.

5. Make the inspector optional chrome, not a required command rail.

   Keep the existing right panel for detailed color, image, sheet, export, share, and colorway workflows, but make it a bounded drawer/panel within the viewport. On small screens it should be collapsible or overlay-style rather than increasing document height. Frequent controls duplicated in canvas toolbars should remain synchronized with inspector state.

   Rationale: the current inspector contains useful detailed controls, but it must not be the reason the app scrolls.

   Alternative considered: remove the inspector entirely. That would regress advanced color, sheet, share, and pattern controls.

## Risks / Trade-offs

- Floating controls can cover useful sheet area → Make each toolbar collapsible, keep compact defaults on small screens, and preserve canvas interaction in uncovered areas.
- Internal inspector scrolling may feel like scrolling → Keep it limited to detailed panels only and ensure the document itself never scrolls.
- Stage overlay positions can conflict with progress and status badges → Consolidate stage overlay zones and validate in phone, tablet portrait, tablet landscape, and desktop screenshots.
- Duplicating controls across toolbars and inspector can drift → Reuse existing state and handlers rather than adding separate command paths.
- Image toolbar could become too dense → Put only fast manipulation controls in the toolbar and keep detailed conversion controls in the inspector.

## Migration Plan

No data migration is required. This is a client UI layout change over existing editor state. Rollback is the previous static build; persisted projects, share links, `.needler` files, PNG exports, and PDF exports remain compatible.
