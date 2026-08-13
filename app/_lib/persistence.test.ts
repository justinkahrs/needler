import { describe, expect, it } from "vitest";
import { deserializeProject, serializeProject } from "./persistence";
import type { Project } from "./needlepointTypes";
import { getAllStitches, makeStitchLayer, makeLayeredProject } from "./layers";

const palette = [
  {
    id: "dmc-321",
    name: "Red",
    hex: "#c72b3b",
    floss: "321",
    source: "dmc" as const,
  },
  {
    id: "dmc-3848",
    name: "Teal Green Medium",
    hex: "#559392",
    floss: "3848",
    source: "dmc" as const,
  },
];

const project: Project = makeLayeredProject({
  canvas: {
    cols: 127,
    rows: 169,
    meshCount: 14,
    widthIn: 9,
    heightIn: 12,
    material: "perforated-paper",
  },
  palette,
  layers: [
    makeStitchLayer({
      id: "details",
      name: "Details",
      visible: false,
      locked: true,
      stitches: [
        {
          id: "original-id",
          from: { col: 4, row: 6 },
          to: { col: 5, row: 5 },
          colorRoleId: "role-red",
          thickness: 14,
          strands: 6,
        },
      ],
    }),
  ],
  activeLayerId: "details",
  colors: {
    roles: [{ id: "role-red", originalColorId: "dmc-321" }],
    current: { "role-red": "dmc-3848" },
    colorways: [
      {
        id: "coastal",
        name: "Coastal",
        assignments: { "role-red": "dmc-3848" },
      },
    ],
    activeColorwayId: "coastal",
  },
});

describe("compact project persistence", () => {
  it("round-trips roles, current assignments, named colorways, and stitches", () => {
    const json = serializeProject(project);
    const restored = deserializeProject(JSON.parse(json));
    const restoredStitches = restored ? getAllStitches(restored) : [];
    const originalStitches = getAllStitches(project);

    expect(restored?.palette).toEqual(project.palette);
    expect(restoredStitches[0]).toMatchObject({
      from: originalStitches[0].from,
      to: originalStitches[0].to,
      colorRoleId: "role-red",
      strands: 6,
    });
    expect(restored?.layers[0]).toMatchObject({
      id: "details",
      name: "Details",
      visible: false,
      locked: true,
    });
    expect(restored?.activeLayerId).toBe("details");
    expect(restored?.colors).toEqual(project.colors);
    expect(JSON.parse(json).version).toBe(4);
    expect(json.length).toBeLessThan(JSON.stringify(project).length);
  });

  it("migrates a version-one runtime project into identity roles", () => {
    const restored = deserializeProject({
      version: 1,
      canvas: project.canvas,
      palette: [palette[0]],
      stitches: [
        {
          id: "legacy",
          from: { col: 1, row: 2 },
          to: { col: 2, row: 1 },
          colorId: "dmc-321",
          thickness: 12,
          strands: 6,
        },
      ],
    });

    expect(restored ? getAllStitches(restored)[0].colorRoleId : "").toBe("role-dmc-321");
    expect(restored?.colors.roles[0].originalColorId).toBe("dmc-321");
    expect(restored?.colors.current).toEqual({});
    expect(restored?.layers[0]).toMatchObject({ visible: true, locked: false });
  });

  it("migrates compact v2 tuples", () => {
    const restored = deserializeProject({
      version: 2,
      palette: [palette[0]],
      stitches: [[3, 4, 4, 3, 0, 6]],
    });

    expect(restored ? getAllStitches(restored)[0] : null).toMatchObject({
      from: { col: 3, row: 4 },
      to: { col: 4, row: 3 },
      colorRoleId: "role-dmc-321",
    });
  });

  it("rejects malformed storage", () => {
    expect(deserializeProject({ version: 3, palette: [], stitches: [[1, 2]] })).toBeNull();
  });
});
