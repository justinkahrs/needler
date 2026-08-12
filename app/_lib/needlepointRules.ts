import type { Hole, Project, Stitch } from "@/app/_lib/needlepointTypes";

export const MAX_HOLE_STRAND_UNITS = 18;

export type HoleCapacityCheck =
  | { canAdd: true; fromLoad: number; toLoad: number }
  | {
      canAdd: false;
      fromLoad: number;
      toLoad: number;
      blockedHole: Hole;
      blockedLoad: number;
    };

export function holeKey(hole: Hole) {
  return `${hole.col}:${hole.row}`;
}
export function getHoleLoad(loadMap: Map<string, number>, hole: Hole) {
  return loadMap.get(holeKey(hole)) ?? 0;
}

function stitchStrands(stitch: Stitch) {
  return Math.min(8, Math.max(1, Math.round(stitch.strands ?? 6)));
}

export function getHoleLoadMap(project: Project) {
  const loadMap = new Map<string, number>();

  for (const stitch of project.stitches) {
    const strands = stitchStrands(stitch);
    for (const hole of [stitch.from, stitch.to]) {
      const key = holeKey(hole);
      loadMap.set(key, (loadMap.get(key) ?? 0) + strands);
    }
  }

  return loadMap;
}

export function canAddStitchWithLoadMap(
  loadMap: Map<string, number>,
  from: Hole,
  to: Hole,
  strands: number,
): HoleCapacityCheck {
  const strandUnits = Math.min(8, Math.max(1, Math.round(strands)));
  const fromLoad = getHoleLoad(loadMap, from);
  const toLoad = getHoleLoad(loadMap, to);

  if (fromLoad + strandUnits > MAX_HOLE_STRAND_UNITS) {
    return {
      canAdd: false,
      fromLoad,
      toLoad,
      blockedHole: from,
      blockedLoad: fromLoad,
    };
  }

  if (toLoad + strandUnits > MAX_HOLE_STRAND_UNITS) {
    return {
      canAdd: false,
      fromLoad,
      toLoad,
      blockedHole: to,
      blockedLoad: toLoad,
    };
  }

  return { canAdd: true, fromLoad, toLoad };
}

export function canAddStitch(
  project: Project,
  from: Hole,
  to: Hole,
  strands: number,
) {
  return canAddStitchWithLoadMap(getHoleLoadMap(project), from, to, strands);
}
