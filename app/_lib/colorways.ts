import { DMC_COLORS } from "@/app/_data/dmcColors";
import type {
  ColorRole,
  Colorway,
  PaletteColor,
  Project,
  ProjectColorState,
} from "@/app/_lib/needlepointTypes";
import { deltaE2000, hexToLab, type Lab } from "@/app/_lib/patternCore";

export type CraftColorwayProfile =
  | "warm"
  | "cool"
  | "earthy"
  | "pastel"
  | "jewel"
  | "monochrome";

export type UsedColorRole = {
  role: ColorRole;
  original: PaletteColor;
  current: PaletteColor;
  count: number;
};

export const CRAFT_COLORWAY_PROFILES: Array<{
  id: CraftColorwayProfile;
  name: string;
}> = [
  { id: "warm", name: "Warm" },
  { id: "cool", name: "Cool" },
  { id: "earthy", name: "Earthy" },
  { id: "pastel", name: "Pastel" },
  { id: "jewel", name: "Jewel" },
  { id: "monochrome", name: "Monochrome" },
];

export const DMC_PALETTE: PaletteColor[] = DMC_COLORS.map((color) => ({
  id: `dmc-${color.floss}`,
  name: color.name,
  hex: color.hex,
  floss: color.floss,
  source: "dmc",
}));

const DMC_LABS = DMC_PALETTE.map((color) => ({ color, lab: hexToLab(color.hex) }));

function hasOwn(record: Record<string, string>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHue(value: number) {
  return ((value % 360) + 360) % 360;
}

function labToLch(lab: Lab) {
  return {
    l: lab.l,
    c: Math.hypot(lab.a, lab.b),
    h: normalizeHue((Math.atan2(lab.b, lab.a) * 180) / Math.PI),
  };
}

function lchToLab(l: number, c: number, h: number): Lab {
  const radians = (h * Math.PI) / 180;
  return { l, a: Math.cos(radians) * c, b: Math.sin(radians) * c };
}

export function makeEmptyColorState(): ProjectColorState {
  return { roles: [], current: {}, colorways: [] };
}

export function buildPaletteMap(palette: PaletteColor[]) {
  return new Map(palette.map((color) => [color.id, color]));
}

export function getAvailableColor(project: Project, colorId: string) {
  return (
    project.palette.find((color) => color.id === colorId) ??
    DMC_PALETTE.find((color) => color.id === colorId)
  );
}

export function getColorRole(project: Project, roleId: string) {
  return project.colors.roles.find((role) => role.id === roleId);
}

export function resolveRoleColorId(
  project: Project,
  roleId: string,
  assignments?: Record<string, string>,
) {
  if (assignments && hasOwn(assignments, roleId)) {
    return assignments[roleId];
  }
  if (hasOwn(project.colors.current, roleId)) {
    return project.colors.current[roleId];
  }
  return getColorRole(project, roleId)?.originalColorId ?? roleId;
}

export function resolveRoleColor(
  project: Project,
  roleId: string,
  assignments?: Record<string, string>,
) {
  const colorId = resolveRoleColorId(project, roleId, assignments);
  return (
    getAvailableColor(project, colorId) ??
    getAvailableColor(project, getColorRole(project, roleId)?.originalColorId ?? "")
  );
}

export function buildResolvedRolePalette(
  project: Project,
  assignments?: Record<string, string>,
) {
  return new Map(
    project.colors.roles.flatMap((role) => {
      const color =
        getAvailableColor(project, resolveRoleColorId(project, role.id, assignments)) ??
        getAvailableColor(project, role.originalColorId);
      return color ? [[role.id, color] as const] : [];
    }),
  );
}

export function getUsedColorRoles(project: Project): UsedColorRole[] {
  const counts = new Map<string, number>();
  for (const stitch of project.stitches) {
    counts.set(stitch.colorRoleId, (counts.get(stitch.colorRoleId) ?? 0) + 1);
  }
  const paletteMap = buildPaletteMap(project.palette);

  return project.colors.roles
    .flatMap((role) => {
      const count = counts.get(role.id) ?? 0;
      const original = paletteMap.get(role.originalColorId);
      const current = paletteMap.get(resolveRoleColorId(project, role.id));
      return count > 0 && original && current
        ? [{ role, original, current, count }]
        : [];
    })
    .sort(
      (first, second) =>
        second.count - first.count ||
        (first.current.floss ?? first.current.name).localeCompare(
          second.current.floss ?? second.current.name,
        ),
    );
}

export function getUsedResolvedColors(project: Project) {
  const paletteMap = buildPaletteMap(project.palette);
  const usage = new Map<string, { color: PaletteColor; count: number }>();
  for (const stitch of project.stitches) {
    const colorId = resolveRoleColorId(project, stitch.colorRoleId);
    const color = paletteMap.get(colorId);
    if (!color) continue;
    const current = usage.get(colorId) ?? { color, count: 0 };
    current.count += 1;
    usage.set(colorId, current);
  }
  return [...usage.values()].sort(
    (first, second) =>
      second.count - first.count ||
      (first.color.floss ?? first.color.name).localeCompare(
        second.color.floss ?? second.color.name,
      ),
  );
}

function uniqueRoleId(project: Project, colorId: string) {
  const taken = new Set(project.colors.roles.map((role) => role.id));
  const base = `role-${colorId}`;
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function ensureColorRole(project: Project, physicalColorId: string) {
  const existing = project.colors.roles.find(
    (role) => role.originalColorId === physicalColorId,
  );
  if (existing) return { project, roleId: existing.id, added: false };

  const role: ColorRole = {
    id: uniqueRoleId(project, physicalColorId),
    originalColorId: physicalColorId,
  };
  return {
    project: {
      ...project,
      colors: {
        ...project.colors,
        roles: [...project.colors.roles, role],
      },
    },
    roleId: role.id,
    added: true,
  };
}

export function normalizeAssignments(
  project: Project,
  assignments: Record<string, string>,
) {
  const paletteIds = new Set(project.palette.map((color) => color.id));
  const result: Record<string, string> = {};
  for (const role of project.colors.roles) {
    const colorId = assignments[role.id];
    if (colorId && paletteIds.has(colorId) && colorId !== role.originalColorId) {
      result[role.id] = colorId;
    }
  }
  return result;
}

export function assignmentsForUsedRoles(project: Project) {
  return Object.fromEntries(
    getUsedColorRoles(project).map((usage) => [
      usage.role.id,
      resolveRoleColorId(project, usage.role.id),
    ]),
  );
}

export function originalAssignments(project: Project) {
  return Object.fromEntries(
    getUsedColorRoles(project).map((usage) => [usage.role.id, usage.role.originalColorId]),
  );
}

export function assignmentsForColorway(project: Project, colorway: Colorway) {
  return Object.fromEntries(
    getUsedColorRoles(project).map((usage) => [
      usage.role.id,
      colorway.assignments[usage.role.id] ?? usage.role.originalColorId,
    ]),
  );
}

export function applyColorAssignments(
  project: Project,
  assignments: Record<string, string>,
  activeColorwayId?: string,
): Project {
  return {
    ...project,
    colors: {
      ...project.colors,
      current: normalizeAssignments(project, {
        ...project.colors.current,
        ...assignments,
      }),
      activeColorwayId,
    },
  };
}

export function addPaletteColors(project: Project, colors: PaletteColor[]) {
  const ids = new Set(project.palette.map((color) => color.id));
  const additions = colors.filter((color) => !ids.has(color.id));
  return additions.length ? { ...project, palette: [...project.palette, ...additions] } : project;
}

function weightedDominantHue(roles: UsedColorRole[]) {
  let x = 0;
  let y = 0;
  for (const usage of roles) {
    const lch = labToLch(hexToLab(usage.current.hex));
    const weight = usage.count * Math.max(lch.c, 4);
    x += Math.cos((lch.h * Math.PI) / 180) * weight;
    y += Math.sin((lch.h * Math.PI) / 180) * weight;
  }
  return normalizeHue((Math.atan2(y, x) * 180) / Math.PI);
}

function transformForProfile(
  lab: Lab,
  profile: CraftColorwayProfile,
  dominantHue: number,
) {
  const source = labToLch(lab);
  if (source.c < 6) {
    const tintHue =
      profile === "cool" ? 230 : profile === "earthy" ? 75 : profile === "monochrome" ? dominantHue : 55;
    return lchToLab(source.l, Math.min(8, source.c + 3), tintHue);
  }

  switch (profile) {
    case "warm":
      return lchToLab(source.l, clamp(source.c * 0.9, 12, 60), 15 + (source.h / 360) * 75);
    case "cool":
      return lchToLab(source.l, clamp(source.c * 0.9, 12, 60), 175 + (source.h / 360) * 115);
    case "earthy":
      return lchToLab(
        clamp(source.l * 0.9, 18, 86),
        clamp(source.c * 0.55, 8, 38),
        25 + (source.h / 360) * 115,
      );
    case "pastel":
      return lchToLab(clamp(55 + source.l * 0.4, 58, 94), clamp(source.c * 0.55, 6, 32), source.h);
    case "jewel":
      return lchToLab(
        clamp(18 + source.l * 0.55, 24, 68),
        clamp(Math.max(source.c * 1.2, 34), 34, 72),
        source.h,
      );
    case "monochrome":
      return lchToLab(source.l, clamp(16 + source.c * 0.2, 16, 34), dominantHue);
  }
}

function assignmentCost(target: Lab, candidate: Lab) {
  return deltaE2000(target, candidate) + Math.abs(target.l - candidate.l) * 0.2;
}

// Rectangular Hungarian assignment. Rows are roles, columns are DMC colors.
function minimumCostDistinct(cost: number[][]) {
  const rows = cost.length;
  const columns = cost[0]?.length ?? 0;
  const u = new Float64Array(rows + 1);
  const v = new Float64Array(columns + 1);
  const p = new Int32Array(columns + 1);
  const way = new Int32Array(columns + 1);

  for (let row = 1; row <= rows; row += 1) {
    p[0] = row;
    let column0 = 0;
    const minimum = new Float64Array(columns + 1);
    minimum.fill(Number.POSITIVE_INFINITY);
    const used = new Uint8Array(columns + 1);
    do {
      used[column0] = 1;
      const row0 = p[column0];
      let delta = Number.POSITIVE_INFINITY;
      let column1 = 0;
      for (let column = 1; column <= columns; column += 1) {
        if (used[column]) continue;
        const current = cost[row0 - 1][column - 1] - u[row0] - v[column];
        if (current < minimum[column]) {
          minimum[column] = current;
          way[column] = column0;
        }
        if (minimum[column] < delta) {
          delta = minimum[column];
          column1 = column;
        }
      }
      for (let column = 0; column <= columns; column += 1) {
        if (used[column]) {
          u[p[column]] += delta;
          v[column] -= delta;
        } else {
          minimum[column] -= delta;
        }
      }
      column0 = column1;
    } while (p[column0] !== 0);

    do {
      const column1 = way[column0];
      p[column0] = p[column1];
      column0 = column1;
    } while (column0 !== 0);
  }

  const assignment = new Int32Array(rows);
  assignment.fill(-1);
  for (let column = 1; column <= columns; column += 1) {
    if (p[column] > 0) assignment[p[column] - 1] = column - 1;
  }
  return [...assignment];
}

export function generateCraftColorway(
  project: Project,
  profile: CraftColorwayProfile,
  lockedRoleIds: ReadonlySet<string>,
) {
  const usedRoles = getUsedColorRoles(project);
  const assignments = assignmentsForUsedRoles(project);
  const reserved = new Set(
    usedRoles
      .filter((usage) => lockedRoleIds.has(usage.role.id))
      .map((usage) => resolveRoleColorId(project, usage.role.id)),
  );
  const unlocked = usedRoles.filter((usage) => !lockedRoleIds.has(usage.role.id));
  if (unlocked.length === 0) return { assignments, colors: [] as PaletteColor[] };

  const dominantHue = weightedDominantHue(usedRoles);
  const candidates = DMC_LABS.filter((candidate) => !reserved.has(candidate.color.id));
  const targets = unlocked.map((usage) =>
    transformForProfile(hexToLab(usage.current.hex), profile, dominantHue),
  );
  const costs = targets.map((target) =>
    candidates.map((candidate, index) => assignmentCost(target, candidate.lab) + index * 1e-8),
  );
  const selectedIndexes = minimumCostDistinct(costs);
  const targetOrder = targets
    .map((target, index) => ({ index, lightness: target.l }))
    .sort((first, second) => first.lightness - second.lightness || first.index - second.index);
  const selectedByLightness = selectedIndexes
    .map((candidateIndex) => candidates[candidateIndex])
    .sort(
      (first, second) =>
        first.lab.l - second.lab.l || first.color.id.localeCompare(second.color.id),
    );
  const valueOrderedIndexes = [...selectedIndexes];
  targetOrder.forEach((target, rank) => {
    valueOrderedIndexes[target.index] = candidates.indexOf(selectedByLightness[rank]);
  });
  const selectedColors: PaletteColor[] = [];

  unlocked.forEach((usage, index) => {
    const selected = candidates[valueOrderedIndexes[index]]?.color;
    if (!selected) return;
    assignments[usage.role.id] = selected.id;
    selectedColors.push(selected);
  });

  return { assignments, colors: selectedColors };
}

export function colorwayMatches(
  project: Project,
  colorway: Colorway,
  assignments: Record<string, string>,
) {
  return getUsedColorRoles(project).every(
    (usage) =>
      (assignments[usage.role.id] ?? usage.role.originalColorId) ===
      (colorway.assignments[usage.role.id] ?? usage.role.originalColorId),
  );
}
