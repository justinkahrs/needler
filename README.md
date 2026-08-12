# Needler

Needler is a browser-based needlepoint simulator for a fixed 9 x 12 inch,
14-count perforated sheet. Draw with real DMC colors, trace reference images,
or convert an image into a physically valid tent-stitch pattern entirely on
your device. Saved DMC colorways make it possible to preview, compare, and
switch complete thread schemes without altering the stitch plan.

The editor enforces an 18-strand capacity at every hole, stores projects in
local browser storage, exports stitched PNG previews, and produces printable
Letter or A4 pattern PDFs with a DMC key and twelve 42 x 42-cell chart pages.

## Getting Started

Install dependencies and run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in a browser.

## Checks

```bash
npm run lint
npm test
npm run build
```

## Deployment

Pushes to `main` run lint, tests, a static Next.js build, and deployment to
[GitHub Pages](https://justinkahrs.github.io/needler/).
