import { describe, expect, it } from "vitest";
import {
  canAddStitchWithLoadMap,
  getHoleLoadMap,
  holeKey,
} from "./needlepointRules";
import type { Project, Stitch } from "./needlepointTypes";

function projectWithSharedHole(strands: number, count: number): Project {
  const stitches: Stitch[] = Array.from({ length: count }, (_, index) => ({
    id: `stitch-${index}`,
    from: { col: 20, row: 20 },
    to: { col: 21 + index, row: 21 },
    colorId: "dmc-321",
    strands,
    thickness: 10,
  }));
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
    palette: [{ id: "dmc-321", name: "Red", hex: "#c72b3b" }],
    stitches,
  };
}

describe("physical hole capacity", () => {
  it("allows three six-strand passes and rejects the fourth", () => {
    const load = getHoleLoadMap(projectWithSharedHole(6, 3));
    expect(load.get(holeKey({ col: 20, row: 20 }))).toBe(18);
    expect(
      canAddStitchWithLoadMap(
        load,
        { col: 20, row: 20 },
        { col: 24, row: 21 },
        6,
      ).canAdd,
    ).toBe(false);
  });

  it("allows a sixth three-strand pass but rejects a seventh", () => {
    const fivePassLoad = getHoleLoadMap(projectWithSharedHole(3, 5));
    expect(
      canAddStitchWithLoadMap(
        fivePassLoad,
        { col: 20, row: 20 },
        { col: 27, row: 21 },
        3,
      ).canAdd,
    ).toBe(true);
    const sixPassLoad = getHoleLoadMap(projectWithSharedHole(3, 6));
    expect(
      canAddStitchWithLoadMap(
        sixPassLoad,
        { col: 20, row: 20 },
        { col: 28, row: 21 },
        3,
      ).canAdd,
    ).toBe(false);
  });
});
