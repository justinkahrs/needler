import { describe, expect, it } from "vitest";
import type { Project, Stitch } from "./needlepointTypes";
import {
  addLayer,
  duplicateLayer,
  getEditableActiveLayer,
  getVisibleStitches,
  makeDefaultLayer,
  makeLayeredProject,
  makeStitchLayer,
  moveActiveLayerBy,
  recolorActiveLayer,
  resizeActiveLayer,
  rotateActiveLayer,
  toggleLayerVisibility,
  validateVisibleComposite,
} from "./layers";

const canvas = {
  cols: 127,
  rows: 169,
  meshCount: 14,
  widthIn: 9,
  heightIn: 12,
  material: "perforated-paper" as const,
};

function stitch(id: string, fromCol = 0, fromRow = 1, toCol = 1, toRow = 0): Stitch {
  return {
    id,
    from: { col: fromCol, row: fromRow },
    to: { col: toCol, row: toRow },
    colorRoleId: "role-red",
    thickness: 12,
    strands: 6,
  };
}

function projectWith(layers = [makeDefaultLayer([stitch("a")])]): Project {
  return makeLayeredProject({
    canvas,
    palette: [
      { id: "dmc-321", name: "Red", hex: "#c72b3b" },
      { id: "dmc-3848", name: "Teal", hex: "#559392" },
    ],
    layers,
    activeLayerId: layers.at(-1)?.id,
    colors: {
      roles: [
        { id: "role-red", originalColorId: "dmc-321" },
        { id: "role-teal", originalColorId: "dmc-3848" },
      ],
      current: {},
      colorways: [],
    },
  });
}

describe("stitch layers", () => {
  it("creates a default active editable layer", () => {
    const project = projectWith([]);
    expect(project.layers).toHaveLength(1);
    expect(getEditableActiveLayer(project).ok).toBe(true);
  });

  it("flattens only visible stitches for visible composites", () => {
    const project = projectWith([
      makeStitchLayer({ id: "visible", name: "Visible", stitches: [stitch("v")] }),
      makeStitchLayer({
        id: "hidden",
        name: "Hidden",
        visible: false,
        stitches: [stitch("h", 2, 1, 3, 0)],
      }),
    ]);

    expect(getVisibleStitches(project).map((item) => item.id)).toEqual(["v"]);
  });

  it("blocks showing a layer that would exceed visible capacity", () => {
    const visible = Array.from({ length: 3 }, (_, index) =>
      stitch(`v-${index}`, 20, 20, 21 + index, 21),
    );
    const project = projectWith([
      makeStitchLayer({ id: "visible", name: "Visible", stitches: visible }),
      makeStitchLayer({
        id: "hidden",
        name: "Hidden",
        visible: false,
        stitches: [stitch("h", 20, 20, 30, 30)],
      }),
    ]);

    expect(toggleLayerVisibility(project, "hidden").ok).toBe(false);
  });

  it("duplicates and recolors layers independently", () => {
    const duplicated = duplicateLayer(projectWith(), "layer-base");
    const recolored = recolorActiveLayer(duplicated, "role-teal");

    expect(duplicated.layers).toHaveLength(2);
    expect(recolored.ok && recolored.project.layers[0].stitches[0].colorRoleId).toBe(
      "role-red",
    );
    expect(recolored.ok && recolored.project.layers[1].stitches[0].colorRoleId).toBe(
      "role-teal",
    );
  });

  it("moves, rotates, and resizes active layer geometry on grid holes", () => {
    const moved = moveActiveLayerBy(projectWith(), 2, 3);
    expect(moved.ok && moved.project.layers[0].stitches[0].from).toEqual({
      col: 2,
      row: 4,
    });

    const rotated = moved.ok ? rotateActiveLayer(moved.project, 1) : moved;
    expect(rotated.ok).toBe(true);

    const resized = rotated.ok ? resizeActiveLayer(rotated.project, 1.1) : rotated;
    expect(resized.ok).toBe(true);
    expect(resized.ok ? validateVisibleComposite(resized.project).ok : false).toBe(true);
  });

  it("adds a new selected layer", () => {
    const project = addLayer(projectWith());
    expect(project.layers).toHaveLength(2);
    expect(project.activeLayerId).toBe(project.layers[1].id);
  });
});
