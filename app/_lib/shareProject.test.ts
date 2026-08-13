import { describe, expect, it } from "vitest";
import type { PaletteColor, Project, Stitch } from "@/app/_lib/needlepointTypes";
import {
  getAllStitches,
  makeDefaultLayer,
  makeLayeredProject,
  makeStitchLayer,
} from "@/app/_lib/layers";
import { serializeProject } from "@/app/_lib/persistence";
import {
  ShareProjectError,
  buildShareUrl,
  createProjectFileBytes,
  decodeProjectFile,
  decodeShareProject,
  encodeShareProject,
  getShareTokenFromHash,
  validateSharedProject,
} from "@/app/_lib/shareProject";

const color: PaletteColor = {
  id: "dmc-321",
  name: "Red",
  hex: "#c72b3b",
  floss: "321",
  source: "dmc",
};

function projectWith(stitches: Stitch[]): Project {
  return makeLayeredProject({
    canvas: {
      cols: 127,
      rows: 169,
      meshCount: 14,
      widthIn: 9,
      heightIn: 12,
      material: "perforated-paper",
    },
    palette: [color],
    layers: [makeDefaultLayer(stitches)],
    colors: {
      roles: [{ id: "role-red", originalColorId: color.id }],
      current: { "role-red": color.id },
      colorways: [
        { id: "bright", name: "Bright", assignments: { "role-red": color.id } },
      ],
      activeColorwayId: "bright",
    },
  });
}

function stitch(
  id: string,
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
  strands = 6,
): Stitch {
  return {
    id,
    from: { col: fromCol, row: fromRow },
    to: { col: toCol, row: toRow },
    colorRoleId: "role-red",
    strands,
    thickness: 12,
  };
}

describe("shared projects", () => {
  it("round trips a row-major tent-stitch grid and its colorways", async () => {
    const project = projectWith([
      stitch("a", 0, 1, 1, 0),
      stitch("b", 1, 1, 2, 0),
      stitch("c", 2, 0, 3, 1),
    ]);
    const encoded = await encodeShareProject(project, 90);
    const decoded = await decodeShareProject(encoded.token);

    expect(encoded.mode).toBe("grid");
    expect(decoded.mode).toBe("grid");
    expect(decoded.rotation).toBe(90);
    expect(serializeProject(decoded.project)).toBe(serializeProject(project));
  });

  it("keeps manual and duplicate stitches as ordered grid exceptions", async () => {
    const project = projectWith([
      stitch("later-cell", 2, 1, 3, 0, 3),
      stitch("earlier-cell", 0, 1, 1, 0, 3),
      stitch("duplicate", 1, 0, 0, 1, 3),
      stitch("long", 4, 4, 12, 12, 3),
    ]);
    const encoded = await encodeShareProject(project, -37.25);
    const decoded = await decodeShareProject(encoded.token);

    expect(encoded.mode).toBe("grid");
    expect(decoded.rotation).toBe(-37.25);
    expect(serializeProject(decoded.project)).toBe(serializeProject(project));
  });

  it("uses ordered stitch tuples when a design has no packable cells", async () => {
    const project = projectWith([
      stitch("long-a", 0, 0, 10, 10, 3),
      stitch("long-b", 20, 20, 30, 30, 3),
    ]);
    const encoded = await encodeShareProject(project);

    expect(encoded.mode).toBe("stitches");
    expect(serializeProject((await decodeShareProject(encoded.token)).project)).toBe(
      serializeProject(project),
    );
  });

  it("opens the same payload from a Needler project file", async () => {
    const project = projectWith([stitch("a", 0, 1, 1, 0)]);
    const encoded = await encodeShareProject(project);
    const file = createProjectFileBytes(encoded);
    const decoded = await decodeProjectFile(file.slice().buffer);

    expect(serializeProject(decoded.project)).toBe(serializeProject(project));
  });

  it("builds a GitHub Pages-safe fragment without changing the pathname", async () => {
    const encoded = await encodeShareProject(projectWith([]));
    const url = buildShareUrl(
      encoded.token,
      "https://justinkahrs.github.io/needler/?source=test#old",
    );
    const parsed = new URL(url);

    expect(parsed.pathname).toBe("/needler/");
    expect(parsed.search).toBe("?source=test");
    expect(getShareTokenFromHash(parsed.hash)).toBe(encoded.token);
  });

  it("rejects projects that exceed physical hole capacity", () => {
    const project = projectWith([
      stitch("a", 0, 0, 1, 1, 6),
      stitch("b", 0, 0, 1, 0, 6),
      stitch("c", 0, 0, 0, 1, 6),
      stitch("d", 0, 0, 2, 2, 6),
    ]);

    expect(() => validateSharedProject(project)).toThrow(ShareProjectError);
  });

  it("keeps a full-sheet generated pattern compact", async () => {
    const stitches: Stitch[] = [];
    for (let row = 0; row < 168; row += 1) {
      for (let col = 0; col < 126; col += 1) {
        stitches.push(stitch(`${col}:${row}`, col, row + 1, col + 1, row, 6));
      }
    }
    const encoded = await encodeShareProject(projectWith(stitches));

    expect(encoded.mode).toBe("grid");
    expect(encoded.compressedBytes).toBeLessThan(10_000);
    expect(getAllStitches((await decodeShareProject(encoded.token)).project)).toHaveLength(
      21_168,
    );
  });

  it("round trips layer metadata including hidden and locked layers", async () => {
    const project = makeLayeredProject({
      canvas: projectWith([]).canvas,
      palette: [color],
      layers: [
        makeStitchLayer({
          id: "base",
          name: "Base",
          stitches: [stitch("base", 0, 1, 1, 0)],
        }),
        makeStitchLayer({
          id: "hidden",
          name: "Hidden alternate",
          visible: false,
          locked: true,
          stitches: [stitch("hidden", 0, 0, 1, 1)],
        }),
      ],
      activeLayerId: "hidden",
      colors: {
        roles: [{ id: "role-red", originalColorId: color.id }],
        current: {},
        colorways: [],
      },
    });
    const decoded = await decodeShareProject((await encodeShareProject(project)).token);

    expect(decoded.project.layers).toHaveLength(2);
    expect(decoded.project.layers[1]).toMatchObject({
      id: "hidden",
      name: "Hidden alternate",
      visible: false,
      locked: true,
    });
    expect(decoded.project.activeLayerId).toBe("hidden");
  });
});
