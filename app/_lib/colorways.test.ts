import { describe, expect, it } from "vitest";
import type { PaletteColor, Project, Stitch } from "./needlepointTypes";
import { makeDefaultLayer, makeLayeredProject } from "./layers";
import {
  applyColorAssignments,
  assignmentsForColorway,
  assignmentsForUsedRoles,
  ensureColorRole,
  generateCraftColorway,
  getUsedResolvedColors,
  originalAssignments,
  resolveRoleColorId,
} from "./colorways";
import { hexToLab } from "./patternCore";

const palette: PaletteColor[] = [
  { id: "dmc-310", name: "Black", hex: "#000000", floss: "310", source: "dmc" },
  { id: "dmc-318", name: "Steel Gray Light", hex: "#ababab", floss: "318", source: "dmc" },
  { id: "dmc-B5200", name: "Snow White", hex: "#ffffff", floss: "B5200", source: "dmc" },
  { id: "custom-sea", name: "Studio Sea", hex: "#348c8b", source: "custom" },
];

function makeProject(): Project {
  const stitches: Stitch[] = [
    ["dark", 0, "role-dark"],
    ["middle", 1, "role-middle"],
    ["light", 2, "role-light"],
    ["light-2", 3, "role-light"],
  ].map(([id, col, colorRoleId]) => ({
    id: String(id),
    from: { col: Number(col), row: 1 },
    to: { col: Number(col) + 1, row: 0 },
    colorRoleId: String(colorRoleId),
    thickness: 12,
    strands: 6,
  }));

  return makeLayeredProject({
    canvas: {
      cols: 127,
      rows: 169,
      meshCount: 14,
      widthIn: 9,
      heightIn: 12,
      material: "perforated-paper",
    },
    palette,
    layers: [makeDefaultLayer(stitches)],
    colors: {
      roles: [
        { id: "role-dark", originalColorId: "dmc-310" },
        { id: "role-middle", originalColorId: "dmc-318" },
        { id: "role-light", originalColorId: "dmc-B5200" },
      ],
      current: {},
      colorways: [],
    },
  });
}

describe("color roles", () => {
  it("resolves current assignments and falls back to the original color", () => {
    const project = makeProject();
    expect(resolveRoleColorId(project, "role-dark")).toBe("dmc-310");
    const recolored = applyColorAssignments(project, {
      "role-dark": "custom-sea",
      "role-middle": "custom-sea",
    });
    expect(resolveRoleColorId(recolored, "role-dark")).toBe("custom-sea");
    expect(getUsedResolvedColors(recolored)).toEqual([
      { color: palette[2], count: 2 },
      { color: palette[3], count: 2 },
    ]);
    expect(originalAssignments(project)).toEqual({
      "role-dark": "dmc-310",
      "role-middle": "dmc-318",
      "role-light": "dmc-B5200",
    });
  });

  it("reuses a role for its original color and creates one otherwise", () => {
    const project = makeProject();
    expect(ensureColorRole(project, "dmc-310").added).toBe(false);
    const added = ensureColorRole(project, "custom-sea");
    expect(added.added).toBe(true);
    expect(added.project.colors.roles.at(-1)?.originalColorId).toBe("custom-sea");
  });

  it("does not bind a new stitch to a role only because its active color matches", () => {
    const recolored = applyColorAssignments(makeProject(), {
      "role-dark": "custom-sea",
    });
    const added = ensureColorRole(recolored, "custom-sea");
    expect(added.added).toBe(true);
    expect(added.roleId).not.toBe("role-dark");
  });

  it("falls back to a new role's original color in an older saved colorway", () => {
    const project = makeProject();
    const colorway = {
      id: "saved",
      name: "Saved",
      assignments: { "role-dark": "custom-sea" },
    };
    const withNewRole: Project = {
      ...project,
      layers: project.layers.map((layer, index) =>
        index === 0
          ? {
              ...layer,
              stitches: [
                ...layer.stitches,
                {
                  id: "new-role-stitch",
                  from: { col: 8, row: 1 },
                  to: { col: 9, row: 0 },
                  colorRoleId: "role-new",
                  thickness: 12,
                  strands: 6,
                },
              ],
            }
          : layer,
      ),
      colors: {
        ...project.colors,
        roles: [
          ...project.colors.roles,
          { id: "role-new", originalColorId: "dmc-318" },
        ],
      },
    };
    expect(assignmentsForColorway(withNewRole, colorway)["role-new"]).toBe(
      "dmc-318",
    );
  });
});

describe("craft colorway generation", () => {
  it("is deterministic, uses distinct DMC colors, and respects locks", () => {
    const project = makeProject();
    const locks = new Set(["role-dark"]);
    const first = generateCraftColorway(project, "jewel", locks);
    const second = generateCraftColorway(project, "jewel", locks);
    expect(first).toEqual(second);
    expect(first.assignments["role-dark"]).toBe("dmc-310");
    const generated = [
      first.assignments["role-middle"],
      first.assignments["role-light"],
    ];
    expect(new Set(generated).size).toBe(2);
    expect(generated.every((id) => id.startsWith("dmc-"))).toBe(true);
  });

  it("preserves value order for a pastel scheme", () => {
    const project = makeProject();
    const result = generateCraftColorway(project, "pastel", new Set());
    const colorsById = new Map(result.colors.map((color) => [color.id, color]));
    const lightness = ["role-dark", "role-middle", "role-light"].map((roleId) =>
      hexToLab(colorsById.get(result.assignments[roleId])?.hex ?? "#000000").l,
    );
    expect(lightness[0]).toBeLessThanOrEqual(lightness[1]);
    expect(lightness[1]).toBeLessThanOrEqual(lightness[2]);
    expect(assignmentsForUsedRoles(project)).toEqual(originalAssignments(project));
  });
});
