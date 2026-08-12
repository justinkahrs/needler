import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { generatePatternPdf } from "./patternPdf";
import type { Project } from "./needlepointTypes";

function makeProject(freeform = false): Project {
  return {
    version: 1,
    canvas: {
      cols: 127,
      rows: 169,
      meshCount: 14,
      widthIn: 9,
      heightIn: 12,
      material: "perforated-paper",
    },
    palette: [
      {
        id: "dmc-321",
        name: "Red",
        hex: "#c72b3b",
        floss: "321",
        source: "dmc",
      },
    ],
    stitches: [
      {
        id: "tent",
        from: { col: 0, row: 1 },
        to: { col: 1, row: 0 },
        colorId: "dmc-321",
        thickness: 12,
        strands: 6,
      },
      ...(freeform
        ? [
            {
              id: "freeform",
              from: { col: 2, row: 3 },
              to: { col: 18, row: 24 },
              colorId: "dmc-321",
              thickness: 12,
              strands: 6,
            },
          ]
        : []),
    ],
  };
}

describe("printable pattern PDF", () => {
  it("creates cover, key, and twelve detail pages", async () => {
    const bytes = await generatePatternPdf(makeProject(), "letter");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(14);
    expect(pdf.getTitle()).toBe("Needler Thread Pattern");
  });

  it("adds an exception index and endpoint map for freeform stitches", async () => {
    const bytes = await generatePatternPdf(makeProject(true), "a4");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(16);
  });
});
