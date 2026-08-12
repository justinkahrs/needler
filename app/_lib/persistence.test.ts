import { describe, expect, it } from "vitest";
import { deserializeProject, serializeProject } from "./persistence";
import type { Project } from "./needlepointTypes";

const project: Project = {
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
      id: "original-id",
      from: { col: 4, row: 6 },
      to: { col: 5, row: 5 },
      colorId: "dmc-321",
      thickness: 14,
      strands: 6,
    },
  ],
};

describe("compact project persistence", () => {
  it("round-trips stitch geometry, palette, and strands", () => {
    const json = serializeProject(project);
    const restored = deserializeProject(JSON.parse(json));

    expect(restored?.palette).toEqual(project.palette);
    expect(restored?.stitches).toHaveLength(1);
    expect(restored?.stitches[0]).toMatchObject({
      from: project.stitches[0].from,
      to: project.stitches[0].to,
      colorId: "dmc-321",
      strands: 6,
    });
    expect(json.length).toBeLessThan(JSON.stringify(project).length);
  });

  it("continues to read a version-one project", () => {
    expect(deserializeProject(project)).toBe(project);
  });

  it("rejects malformed storage", () => {
    expect(deserializeProject({ version: 2, palette: [], stitches: [[1, 2]] })).toBeNull();
  });
});
