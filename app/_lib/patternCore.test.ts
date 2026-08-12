import { describe, expect, it } from "vitest";
import { convertImageToPattern, deltaE2000 } from "./patternCore";
import type { PaletteColor, PatternDetail } from "./needlepointTypes";

function imageFromCells(
  colors: Array<[number, number, number, number]>,
  cols: number,
  rows: number,
  scale = 4,
) {
  const width = cols * scale;
  const height = rows * scale;
  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const color = colors[row * cols + col];
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          const offset = ((row * scale + y) * width + col * scale + x) * 4;
          rgba.set(color, offset);
        }
      }
    }
  }

  return { rgba, width, height };
}

function convert(
  colors: Array<[number, number, number, number]>,
  cols: number,
  rows: number,
  options: {
    detail?: PatternDetail;
    maxColors?: number;
    existingPalette?: PaletteColor[];
    backgroundHex?: string;
    backgroundTolerance?: number;
  } = {},
) {
  return convertImageToPattern({
    ...imageFromCells(colors, cols, rows),
    cols,
    rows,
    existingPalette: options.existingPalette ?? [],
    settings: {
      maxColors: options.maxColors ?? 16,
      detail: options.detail ?? "high",
      strands: 6,
      direction: "slash",
      backgroundHex: options.backgroundHex,
      backgroundTolerance: options.backgroundTolerance ?? 10,
    },
  });
}

describe("DMC color conversion", () => {
  it("matches the published CIEDE2000 reference pair", () => {
    expect(
      deltaE2000(
        { l: 50, a: 2.6772, b: -79.7751 },
        { l: 50, a: 0, b: -82.7485 },
      ),
    ).toBeCloseTo(2.0425, 4);
  });

  it("is deterministic and respects the palette cap", () => {
    const colors: Array<[number, number, number, number]> = [
      [220, 30, 45, 255],
      [20, 150, 180, 255],
      [240, 210, 50, 255],
      [45, 115, 65, 255],
    ];
    const first = convert(colors, 2, 2, { maxColors: 2 });
    const second = convert(colors, 2, 2, { maxColors: 2 });

    expect(first.colors.length).toBeLessThanOrEqual(2);
    expect([...first.cells]).toEqual([...second.cells]);
    expect(first.colors.map((usage) => usage.color.id)).toEqual(
      second.colors.map((usage) => usage.color.id),
    );
  });

  it("prefers an exact existing custom thread", () => {
    const existing: PaletteColor = {
      id: "thread-sample",
      name: "Sample thread",
      hex: "#123456",
      source: "custom",
    };
    const result = convert([[18, 52, 86, 255]], 1, 1, {
      existingPalette: [existing],
    });

    expect(result.colors[0].color.id).toBe(existing.id);
    expect(result.colors[0].existing).toBe(true);
  });

  it("omits transparent and selected background cells", () => {
    const transparent = convert([[255, 255, 255, 0]], 1, 1);
    const background = convert([[255, 255, 255, 255]], 1, 1, {
      backgroundHex: "#ffffff",
      backgroundTolerance: 1,
    });

    expect(transparent.stats.transparentCells).toBe(1);
    expect(transparent.stats.stitchedCells).toBe(0);
    expect(background.stats.backgroundCells).toBe(1);
    expect(background.stats.stitchedCells).toBe(0);
  });

  it("removes isolated one-cell colors at medium detail", () => {
    const blue: [number, number, number, number] = [20, 80, 190, 255];
    const red: [number, number, number, number] = [210, 35, 55, 255];
    const colors = Array.from({ length: 9 }, () => blue);
    colors[4] = red;
    const high = convert(colors, 3, 3, { detail: "high", maxColors: 2 });
    const medium = convert(colors, 3, 3, { detail: "medium", maxColors: 2 });

    expect(high.cells[4]).not.toBe(high.cells[1]);
    expect(medium.cells[4]).toBe(medium.cells[1]);
    expect(medium.stats.simplifiedCells).toBeGreaterThan(0);
  });
});
