<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Needler Agent Guide

## Project State

Needler is a client-side needlepoint design simulator built with Next.js App
Router, React, TypeScript, Tailwind CSS, Vitest, `lucide-react`, and `pdf-lib`.
The app models a fixed 9 x 12 inch, 14-count perforated sheet with 127 x 169
holes and 126 x 168 stitch cells.

Current dependency anchors are in `package.json`: Next.js 16.3.0, React
19.2.8, TypeScript 5, Tailwind CSS 4, Vitest 4, and npm scripts for `dev`,
`lint`, `test`, and `build`.

The app is designed to run without a backend. It stores work in browser storage,
generates stitched PNG previews and printable PDFs in the browser, converts
reference images to DMC-based tent-stitch patterns, supports saved colorways,
and shares finished projects through compressed URL fragments or `.needler`
files. Reference images are intentionally local-only and are not included in
share/export payloads.

Deployment is static: `next.config.ts` uses `output: "export"`, configures a
GitHub Pages `basePath`/`assetPrefix` only in GitHub Actions, and disables image
optimization. Avoid adding runtime-only Next.js features, server persistence, or
API routes unless the deployment model is deliberately changed.

## OpenSpec Workflow

OpenSpec is installed for this repo using Codex skills in `.agents/skills/` and
project config in `openspec/config.yaml` with `schema: spec-driven`.

Users should not have to invoke OpenSpec skills manually. Treat natural-language
requests as enough signal to select the right skill in the background:

- Use `openspec-explore` when the user wants to think through an idea, compare
  approaches, clarify requirements, or investigate a problem before changing
  code.
- Use `openspec-propose` for substantial new features, behavior changes, storage
  or share-format changes, architecture changes, or any user-facing workflow
  that benefits from a spec before implementation.
- Use `openspec-update-change` when an existing OpenSpec change needs revised
  decisions, tasks, design notes, or delta specs. This skill does not edit code.
- Use `openspec-apply-change` when the user asks to implement or continue work
  from an OpenSpec change.
- Use `openspec-sync-specs` when the user wants to merge a change's delta specs
  into the main specs without archiving.
- Use `openspec-archive-change` after an implemented change is ready to finalize
  and archive.

Do not ask the user to type `$openspec-*` unless they specifically ask how to
invoke a skill. If a request is small and local, such as a typo, a narrow bug
fix, or a mechanical cleanup, it is fine to edit directly. If the request could
change product behavior or persisted formats and the user did not explicitly ask
to skip process, default to OpenSpec first.

Before implementing an OpenSpec-managed change, read `openspec/config.yaml`, the
change artifacts under `openspec/changes/`, and any affected specs under
`openspec/specs/`. Keep proposal, design, tasks, and specs coherent; do not
update one artifact while leaving contradictions in another.

## Code Organization

- `app/page.tsx` renders the main `NeedlepointEditor`.
- `app/layout.tsx` owns app metadata, fonts, and the root document shell.
- `app/_components/` contains interactive client UI such as the editor,
  colorway studio, and share panel.
- `app/_lib/` contains domain logic, persistence, sharing, PDF generation,
  pattern conversion, and colocated Vitest coverage.
- `app/_data/dmcColors.ts` is the DMC thread catalog used for palette matching.
- `app/_workers/` contains browser workers for expensive pattern/PDF work.
- `app/globals.css` defines Tailwind import, theme variables, and base element
  defaults.

Keep pure domain logic in `app/_lib/` where it can be tested with Vitest. Keep
browser APIs, canvas work, file inputs, clipboard/share APIs, and `localStorage`
inside client components or workers. Use the `@/` alias for app imports.

## Domain Rules

Preserve the physical model unless a spec explicitly changes it:

- Sheet: 9 x 12 inches at 14 mesh.
- Holes: 127 columns by 169 rows.
- Tent-stitch grid: 126 columns by 168 rows.
- Maximum hole load: 18 strand units.
- Default strand count: 6.

Stitches reference color roles, not just physical colors. Colorways remap roles
to palette colors without changing the stitch plan. Persistence serializes the
runtime project into a compact stored format and migrates older project shapes;
changes to persistence, share links, or `.needler` files need compatibility
tests.

Pattern conversion should stay deterministic. Keep color matching and
quantization logic in pure functions where possible, and preserve DMC matching
behavior unless the change explicitly calls for a different palette strategy.

## Next.js Rules

Before changing Next.js routing, configuration, rendering behavior, metadata,
images, fonts, or server/client component boundaries, read the relevant local
guide in `node_modules/next/dist/docs/` as instructed above. This project uses
the App Router; do not apply Pages Router patterns unless adding Pages Router
support is intentional.

Use `"use client"` only at client entry boundaries. Components needing state,
event handlers, effects, or browser APIs must be client components; components
without those needs should remain server-compatible. Remember that imports below
a `"use client"` boundary join the client bundle.

Because the app is statically exported, validate features against static export
constraints. Avoid request-time server APIs, secrets, dynamic server functions,
or deployment assumptions that require a Node server.

## Validation

Use npm for this repo. Prefer targeted checks while iterating, then run the full
set when the change affects behavior broadly:

```bash
npm run lint
npm test
npm run build
```

Run focused Vitest files for narrow domain changes, for example
`npm test -- app/_lib/shareProject.test.ts`. For UI changes, run the dev server
with `npm run dev` and inspect the app in a browser; verify responsive layout
and canvas interactions when relevant.

Do not edit generated build output in `.next/` or `out/`. Do not overwrite
unrelated dirty work in the tree.
