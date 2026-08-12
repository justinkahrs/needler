import type {
  ColorRole,
  Colorway,
  PaletteColor,
  Project,
  SheetCanvas,
  Stitch,
} from "@/app/_lib/needlepointTypes";

export const PROJECT_STORAGE_KEY = "needler.project.v3";
export const PREVIOUS_PROJECT_STORAGE_KEY = "needler.project.v2";
export const LEGACY_PROJECT_STORAGE_KEY = "needler.project.v1";

type StoredStitchV2 = [
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
  paletteIndex: number,
  strands: number,
];

type StoredStitchV3 = [
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
  roleIndex: number,
  strands: number,
];

type StoredAssignment = [roleIndex: number, paletteIndex: number];

type StoredProjectV2 = {
  version: 2;
  palette: PaletteColor[];
  stitches: StoredStitchV2[];
};

type StoredColorwayV3 = {
  id: string;
  name: string;
  assignments: StoredAssignment[];
};

type StoredProjectV3 = {
  version: 3;
  palette: PaletteColor[];
  roles: Array<[id: string, originalPaletteIndex: number]>;
  current: StoredAssignment[];
  colorways: StoredColorwayV3[];
  activeColorwayId?: string;
  stitches: StoredStitchV3[];
};

type LegacyStitch = Omit<Stitch, "colorRoleId"> & { colorId: string };
type LegacyProjectV1 = Omit<Project, "version" | "colors" | "stitches"> & {
  version: 1;
  stitches: LegacyStitch[];
};

const FIXED_CANVAS: SheetCanvas = {
  cols: 127,
  rows: 169,
  meshCount: 14,
  widthIn: 9,
  heightIn: 12,
  material: "perforated-paper",
};

function isPaletteColor(value: unknown): value is PaletteColor {
  if (!value || typeof value !== "object") return false;
  const color = value as PaletteColor;
  return (
    typeof color.id === "string" &&
    typeof color.name === "string" &&
    /^#[0-9a-f]{6}$/i.test(color.hex)
  );
}

function isNumberTuple(value: unknown, length: number) {
  return Array.isArray(value) && value.length === length && value.every(Number.isFinite);
}

function isStoredAssignment(value: unknown): value is StoredAssignment {
  return isNumberTuple(value, 2);
}

function isLegacyProject(value: unknown): value is LegacyProjectV1 {
  if (!value || typeof value !== "object") return false;
  const project = value as LegacyProjectV1;
  return (
    project.version === 1 &&
    Boolean(project.canvas) &&
    Array.isArray(project.palette) &&
    project.palette.every(isPaletteColor) &&
    Array.isArray(project.stitches) &&
    project.stitches.every(
      (stitch) =>
        stitch &&
        typeof stitch === "object" &&
        typeof stitch.colorId === "string" &&
        Boolean(stitch.from) &&
        Boolean(stitch.to),
    )
  );
}

function isStoredProjectV2(value: unknown): value is StoredProjectV2 {
  if (!value || typeof value !== "object") return false;
  const project = value as StoredProjectV2;
  return (
    project.version === 2 &&
    Array.isArray(project.palette) &&
    project.palette.every(isPaletteColor) &&
    Array.isArray(project.stitches) &&
    project.stitches.every((stitch) => isNumberTuple(stitch, 6))
  );
}

function isStoredColorway(value: unknown): value is StoredColorwayV3 {
  if (!value || typeof value !== "object") return false;
  const colorway = value as StoredColorwayV3;
  return (
    typeof colorway.id === "string" &&
    typeof colorway.name === "string" &&
    Array.isArray(colorway.assignments) &&
    colorway.assignments.every(isStoredAssignment)
  );
}

function isStoredProjectV3(value: unknown): value is StoredProjectV3 {
  if (!value || typeof value !== "object") return false;
  const project = value as StoredProjectV3;
  return (
    project.version === 3 &&
    Array.isArray(project.palette) &&
    project.palette.every(isPaletteColor) &&
    Array.isArray(project.roles) &&
    project.roles.every(
      (role) =>
        Array.isArray(role) &&
        role.length === 2 &&
        typeof role[0] === "string" &&
        Number.isFinite(role[1]),
    ) &&
    Array.isArray(project.current) &&
    project.current.every(isStoredAssignment) &&
    Array.isArray(project.colorways) &&
    project.colorways.every(isStoredColorway) &&
    Array.isArray(project.stitches) &&
    project.stitches.every((stitch) => isNumberTuple(stitch, 6)) &&
    (project.activeColorwayId === undefined ||
      typeof project.activeColorwayId === "string")
  );
}

function uniqueRoleId(colorId: string, taken: Set<string>) {
  const base = `role-${colorId}`;
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  const result = `${base}-${suffix}`;
  taken.add(result);
  return result;
}

function migratePaletteStitches(
  palette: PaletteColor[],
  stitches: Array<{
    id: string;
    from: Stitch["from"];
    to: Stitch["to"];
    colorId: string;
    thickness: number;
    strands?: number;
  }>,
): Project {
  const taken = new Set<string>();
  const roleByColor = new Map<string, ColorRole>();
  const ensureRole = (colorId: string) => {
    const existing = roleByColor.get(colorId);
    if (existing) return existing;
    const role = { id: uniqueRoleId(colorId, taken), originalColorId: colorId };
    roleByColor.set(colorId, role);
    return role;
  };

  for (const color of palette) ensureRole(color.id);

  return {
    version: 2,
    canvas: FIXED_CANVAS,
    palette,
    stitches: stitches.map((stitch) => ({
      id: stitch.id,
      from: stitch.from,
      to: stitch.to,
      colorRoleId: ensureRole(stitch.colorId).id,
      thickness: stitch.thickness,
      strands: stitch.strands,
    })),
    colors: {
      roles: [...roleByColor.values()],
      current: {},
      colorways: [],
    },
  };
}

function assignmentsFromStored(
  assignments: StoredAssignment[],
  roles: ColorRole[],
  palette: PaletteColor[],
) {
  const result: Record<string, string> = {};
  for (const [roleIndex, paletteIndex] of assignments) {
    const role = roles[roleIndex];
    const color = palette[paletteIndex];
    if (role && color) result[role.id] = color.id;
  }
  return result;
}

function deserializeV3(value: StoredProjectV3): Project {
  const roles: ColorRole[] = value.roles.flatMap(([id, paletteIndex]) => {
    const color = value.palette[paletteIndex];
    return color ? [{ id, originalColorId: color.id }] : [];
  });
  const stitches: Stitch[] = value.stitches.flatMap((stored, index) => {
    const [fromCol, fromRow, toCol, toRow, roleIndex, strands] = stored;
    const role = roles[roleIndex];
    return role
      ? [
          {
            id: `saved-${index.toString(36)}`,
            from: { col: fromCol, row: fromRow },
            to: { col: toCol, row: toRow },
            colorRoleId: role.id,
            strands,
            thickness: 0,
          },
        ]
      : [];
  });
  const colorways: Colorway[] = value.colorways.map((colorway) => ({
    id: colorway.id,
    name: colorway.name,
    assignments: assignmentsFromStored(colorway.assignments, roles, value.palette),
  }));

  return {
    version: 2,
    canvas: FIXED_CANVAS,
    palette: value.palette,
    stitches,
    colors: {
      roles,
      current: assignmentsFromStored(value.current, roles, value.palette),
      colorways,
      activeColorwayId: colorways.some(
        (colorway) => colorway.id === value.activeColorwayId,
      )
        ? value.activeColorwayId
        : undefined,
    },
  };
}

export function serializeProject(project: Project) {
  const paletteIndex = new Map(project.palette.map((color, index) => [color.id, index]));
  const roles = project.colors.roles.flatMap((role) => {
    const originalIndex = paletteIndex.get(role.originalColorId);
    return originalIndex === undefined ? [] : [[role.id, originalIndex] as [string, number]];
  });
  const roleIndex = new Map(roles.map(([id], index) => [id, index]));
  const serializeAssignments = (assignments: Record<string, string>) =>
    Object.entries(assignments).flatMap(([roleId, colorId]) => {
      const storedRole = roleIndex.get(roleId);
      const storedColor = paletteIndex.get(colorId);
      return storedRole === undefined || storedColor === undefined
        ? []
        : [[storedRole, storedColor] as StoredAssignment];
    });
  const stitches: StoredStitchV3[] = project.stitches.flatMap((stitch) => {
    const storedRole = roleIndex.get(stitch.colorRoleId);
    return storedRole === undefined
      ? []
      : [
          [
            stitch.from.col,
            stitch.from.row,
            stitch.to.col,
            stitch.to.row,
            storedRole,
            stitch.strands ?? 6,
          ],
        ];
  });

  return JSON.stringify({
    version: 3,
    palette: project.palette,
    roles,
    current: serializeAssignments(project.colors.current),
    colorways: project.colors.colorways.map((colorway) => ({
      id: colorway.id,
      name: colorway.name,
      assignments: serializeAssignments(colorway.assignments),
    })),
    activeColorwayId: project.colors.activeColorwayId,
    stitches,
  } satisfies StoredProjectV3);
}

export function deserializeProject(value: unknown): Project | null {
  if (isStoredProjectV3(value)) return deserializeV3(value);
  if (isLegacyProject(value)) {
    return migratePaletteStitches(value.palette, value.stitches);
  }
  if (!isStoredProjectV2(value)) return null;

  const stitches = value.stitches.flatMap((stored, index) => {
    const [fromCol, fromRow, toCol, toRow, paletteIndex, strands] = stored;
    const color = value.palette[paletteIndex];
    return color
      ? [
          {
            id: `saved-${index.toString(36)}`,
            from: { col: fromCol, row: fromRow },
            to: { col: toCol, row: toRow },
            colorId: color.id,
            strands,
            thickness: 0,
          },
        ]
      : [];
  });
  return migratePaletteStitches(value.palette, stitches);
}
