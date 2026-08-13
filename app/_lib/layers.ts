import type {
  Hole,
  PaletteColor,
  Project,
  ProjectColorState,
  SheetCanvas,
  Stitch,
  StitchLayer,
} from "@/app/_lib/needlepointTypes";

export const DEFAULT_LAYER_ID = "layer-base";
export const DEFAULT_LAYER_NAME = "Layer 1";
const MAX_HOLE_STRAND_UNITS = 18;

export type LayerValidation =
  | { ok: true }
  | { ok: false; reason: string; blockedHole?: Hole };

export type LayerTransformResult =
  | { ok: true; project: Project }
  | { ok: false; reason: string };

export function makeLayerId(prefix = "layer") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

export function makeDefaultLayer(stitches: Stitch[] = []): StitchLayer {
  return {
    id: DEFAULT_LAYER_ID,
    name: DEFAULT_LAYER_NAME,
    visible: true,
    locked: false,
    stitches,
  };
}

export function makeStitchLayer({
  id = makeLayerId(),
  name,
  visible = true,
  locked = false,
  stitches = [],
}: Partial<StitchLayer> & { name: string }): StitchLayer {
  return {
    id,
    name: name.trim() || DEFAULT_LAYER_NAME,
    visible,
    locked,
    stitches,
  };
}

export function nextLayerName(layers: readonly StitchLayer[]) {
  const used = new Set(layers.map((layer) => layer.name));
  let index = layers.length + 1;
  let name = `Layer ${index}`;

  while (used.has(name)) {
    index += 1;
    name = `Layer ${index}`;
  }

  return name;
}

export function makeLayeredProject({
  canvas,
  palette,
  colors,
  layers,
  activeLayerId,
}: {
  canvas: SheetCanvas;
  palette: PaletteColor[];
  colors: ProjectColorState;
  layers?: StitchLayer[];
  activeLayerId?: string;
}): Project {
  const normalizedLayers = ensureUsableLayers(layers?.length ? layers : [makeDefaultLayer()]);
  const active =
    activeLayerId && normalizedLayers.some((layer) => layer.id === activeLayerId)
      ? activeLayerId
      : normalizedLayers[0].id;

  return {
    version: 3,
    canvas,
    palette,
    layers: normalizedLayers,
    activeLayerId: active,
    colors,
  };
}

export function migrateFlatProjectToLayers(
  project: Omit<Project, "version" | "layers" | "activeLayerId"> & {
    version?: number;
    stitches?: Stitch[];
  },
): Project {
  return makeLayeredProject({
    canvas: project.canvas,
    palette: project.palette,
    colors: project.colors,
    layers: [makeDefaultLayer(project.stitches ?? [])],
  });
}

export function ensureUsableLayers(layers: readonly StitchLayer[]): StitchLayer[] {
  if (layers.length === 0) {
    return [makeDefaultLayer()];
  }

  return layers.map((layer, index) => ({
    id: layer.id || (index === 0 ? DEFAULT_LAYER_ID : makeLayerId()),
    name: layer.name.trim() || `Layer ${index + 1}`,
    visible: layer.visible,
    locked: layer.locked,
    stitches: layer.stitches,
  }));
}

export function normalizeActiveLayer(project: Project): Project {
  const layers = ensureUsableLayers(project.layers);
  const activeLayerId = layers.some((layer) => layer.id === project.activeLayerId)
    ? project.activeLayerId
    : layers[0].id;

  return layers === project.layers && activeLayerId === project.activeLayerId
    ? project
    : { ...project, layers, activeLayerId };
}

export function getAllStitches(project: Project) {
  return project.layers.flatMap((layer) => layer.stitches);
}

export function getVisibleLayers(project: Project) {
  return project.layers.filter((layer) => layer.visible);
}

export function getVisibleStitches(project: Project) {
  return getVisibleLayers(project).flatMap((layer) => layer.stitches);
}

export function getVisibleStitchCount(project: Project) {
  return getVisibleStitches(project).length;
}

export function getAllStitchCount(project: Project) {
  return getAllStitches(project).length;
}

export function getLayerById(project: Project, layerId: string) {
  return project.layers.find((layer) => layer.id === layerId);
}

export function getActiveLayer(project: Project) {
  return getLayerById(project, project.activeLayerId) ?? project.layers[0];
}

export function getEditableActiveLayer(project: Project):
  | { ok: true; layer: StitchLayer }
  | { ok: false; reason: string } {
  const layer = getActiveLayer(project);

  if (!layer) {
    return { ok: false, reason: "Create a layer before editing." };
  }
  if (!layer.visible) {
    return { ok: false, reason: "Show or select a visible layer before editing." };
  }
  if (layer.locked) {
    return { ok: false, reason: "Unlock or select an editable layer before editing." };
  }

  return { ok: true, layer };
}

export function updateLayer(
  project: Project,
  layerId: string,
  update: (layer: StitchLayer) => StitchLayer,
) {
  return normalizeActiveLayer({
    ...project,
    layers: project.layers.map((layer) => (layer.id === layerId ? update(layer) : layer)),
  });
}

export function appendStitchesToLayer(
  project: Project,
  layerId: string,
  stitches: Stitch[],
) {
  return updateLayer(project, layerId, (layer) => ({
    ...layer,
    stitches: [...layer.stitches, ...stitches],
  }));
}

export function replaceLayerStitches(
  project: Project,
  layerId: string,
  stitches: Stitch[],
) {
  return updateLayer(project, layerId, (layer) => ({ ...layer, stitches }));
}

export function addLayer(project: Project, name = nextLayerName(project.layers)) {
  const layer = makeStitchLayer({ name });
  return {
    ...project,
    layers: [...project.layers, layer],
    activeLayerId: layer.id,
  };
}

export function addLayerWithStitches(
  project: Project,
  name: string,
  stitches: Stitch[],
) {
  const layer = makeStitchLayer({ name, stitches });
  return {
    ...project,
    layers: [...project.layers, layer],
    activeLayerId: layer.id,
  };
}

export function selectLayer(project: Project, layerId: string) {
  return project.layers.some((layer) => layer.id === layerId)
    ? { ...project, activeLayerId: layerId }
    : project;
}

export function renameLayer(project: Project, layerId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return project;
  return updateLayer(project, layerId, (layer) => ({ ...layer, name: trimmed }));
}

export function duplicateLayer(project: Project, layerId: string) {
  const source = getLayerById(project, layerId);
  if (!source) return project;
  const copy = makeStitchLayer({
    name: `${source.name} copy`,
    visible: source.visible,
    locked: false,
    stitches: source.stitches.map((stitch) => ({
      ...stitch,
      id: `${stitch.id}-copy-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`,
      from: { ...stitch.from },
      to: { ...stitch.to },
    })),
  });
  const sourceIndex = project.layers.findIndex((layer) => layer.id === layerId);
  const layers = [...project.layers];
  layers.splice(sourceIndex + 1, 0, copy);
  return { ...project, layers, activeLayerId: copy.id };
}

export function deleteLayer(project: Project, layerId: string) {
  if (project.layers.length <= 1) {
    return project;
  }
  const layers = project.layers.filter((layer) => layer.id !== layerId);
  const activeLayerId =
    project.activeLayerId === layerId ? layers[Math.min(project.layers.length - 2, 0)].id : project.activeLayerId;
  return normalizeActiveLayer({ ...project, layers, activeLayerId });
}

export function mergeLayerDown(project: Project, layerId: string) {
  const index = project.layers.findIndex((layer) => layer.id === layerId);
  if (index <= 0) return project;
  const source = project.layers[index];
  const destination = project.layers[index - 1];
  const layers = project.layers.slice();
  layers[index - 1] = {
    ...destination,
    stitches: [...destination.stitches, ...source.stitches],
  };
  layers.splice(index, 1);
  return normalizeActiveLayer({
    ...project,
    layers,
    activeLayerId: destination.id,
  });
}

export function moveLayer(project: Project, layerId: string, offset: -1 | 1) {
  const index = project.layers.findIndex((layer) => layer.id === layerId);
  const nextIndex = index + offset;
  if (index < 0 || nextIndex < 0 || nextIndex >= project.layers.length) {
    return project;
  }
  const layers = project.layers.slice();
  const [layer] = layers.splice(index, 1);
  layers.splice(nextIndex, 0, layer);
  return { ...project, layers };
}

export function toggleLayerVisibility(project: Project, layerId: string): LayerTransformResult {
  const layer = getLayerById(project, layerId);
  if (!layer) return { ok: false, reason: "Layer not found." };

  if (layer.visible) {
    return {
      ok: true,
      project: updateLayer(project, layerId, (current) => ({ ...current, visible: false })),
    };
  }

  const candidate = updateLayer(project, layerId, (current) => ({ ...current, visible: true }));
  const validation = validateVisibleComposite(candidate);
  return validation.ok
    ? { ok: true, project: candidate }
    : { ok: false, reason: validation.reason };
}

export function toggleLayerLock(project: Project, layerId: string) {
  return updateLayer(project, layerId, (layer) => ({ ...layer, locked: !layer.locked }));
}

function stitchStrands(stitch: Stitch) {
  return Math.min(8, Math.max(1, Math.round(stitch.strands ?? 6)));
}

function holeKey(hole: Hole) {
  return `${hole.col}:${hole.row}`;
}

function isHoleWithinCanvas(hole: Hole, canvas: SheetCanvas) {
  return (
    Number.isInteger(hole.col) &&
    Number.isInteger(hole.row) &&
    hole.col >= 0 &&
    hole.row >= 0 &&
    hole.col < canvas.cols &&
    hole.row < canvas.rows
  );
}

function isValidStitch(stitch: Stitch, canvas: SheetCanvas) {
  return (
    isHoleWithinCanvas(stitch.from, canvas) &&
    isHoleWithinCanvas(stitch.to, canvas) &&
    !(stitch.from.col === stitch.to.col && stitch.from.row === stitch.to.row)
  );
}

export function validateVisibleComposite(project: Project): LayerValidation {
  const loadMap = new Map<string, number>();

  for (const layer of getVisibleLayers(project)) {
    for (const stitch of layer.stitches) {
      if (!isValidStitch(stitch, project.canvas)) {
        return {
          ok: false,
          reason: "Layer contains stitches outside the sheet.",
        };
      }

      const strands = stitchStrands(stitch);
      for (const hole of [stitch.from, stitch.to]) {
        const key = holeKey(hole);
        const nextLoad = (loadMap.get(key) ?? 0) + strands;
        if (nextLoad > MAX_HOLE_STRAND_UNITS) {
          return {
            ok: false,
            reason: `Hole ${hole.col},${hole.row} would exceed ${MAX_HOLE_STRAND_UNITS} strands.`,
            blockedHole: hole,
          };
        }
        loadMap.set(key, nextLoad);
      }
    }
  }

  return { ok: true };
}

function validateLayerEdit(project: Project, candidate: Project): LayerTransformResult {
  const validation = validateVisibleComposite(candidate);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason };
  }
  return { ok: true, project: candidate };
}

export function moveActiveLayerBy(
  project: Project,
  deltaCol: number,
  deltaRow: number,
): LayerTransformResult {
  const editable = getEditableActiveLayer(project);
  if (!editable.ok) return { ok: false, reason: editable.reason } satisfies LayerTransformResult;
  const nextStitches = editable.layer.stitches.map((stitch) => ({
    ...stitch,
    from: { col: stitch.from.col + deltaCol, row: stitch.from.row + deltaRow },
    to: { col: stitch.to.col + deltaCol, row: stitch.to.row + deltaRow },
  }));
  return validateLayerEdit(
    project,
    replaceLayerStitches(project, editable.layer.id, nextStitches),
  );
}

function getLayerBounds(layer: StitchLayer) {
  const holes = layer.stitches.flatMap((stitch) => [stitch.from, stitch.to]);
  if (holes.length === 0) {
    return null;
  }
  return {
    minCol: Math.min(...holes.map((hole) => hole.col)),
    maxCol: Math.max(...holes.map((hole) => hole.col)),
    minRow: Math.min(...holes.map((hole) => hole.row)),
    maxRow: Math.max(...holes.map((hole) => hole.row)),
  };
}

function rotateHole(hole: Hole, center: { col: number; row: number }, quarterTurns: number) {
  const turns = ((quarterTurns % 4) + 4) % 4;
  let x = hole.col - center.col;
  let y = hole.row - center.row;

  for (let turn = 0; turn < turns; turn += 1) {
    [x, y] = [-y, x];
  }

  return {
    col: Math.round(center.col + x),
    row: Math.round(center.row + y),
  };
}

export function rotateActiveLayer(project: Project, quarterTurns: number): LayerTransformResult {
  const editable = getEditableActiveLayer(project);
  if (!editable.ok) return { ok: false, reason: editable.reason } satisfies LayerTransformResult;
  const bounds = getLayerBounds(editable.layer);
  if (!bounds) return { ok: true, project };
  const center = {
    col: Math.round((bounds.minCol + bounds.maxCol) / 2),
    row: Math.round((bounds.minRow + bounds.maxRow) / 2),
  };
  const nextStitches = editable.layer.stitches.map((stitch) => ({
    ...stitch,
    from: rotateHole(stitch.from, center, quarterTurns),
    to: rotateHole(stitch.to, center, quarterTurns),
  }));
  return validateLayerEdit(
    project,
    replaceLayerStitches(project, editable.layer.id, nextStitches),
  );
}

export function resizeActiveLayer(project: Project, scale: number): LayerTransformResult {
  const editable = getEditableActiveLayer(project);
  if (!editable.ok) return { ok: false, reason: editable.reason } satisfies LayerTransformResult;
  if (!Number.isFinite(scale) || scale <= 0) {
    return { ok: false, reason: "Choose a positive resize amount." };
  }
  const bounds = getLayerBounds(editable.layer);
  if (!bounds) return { ok: true, project };
  const center = {
    col: (bounds.minCol + bounds.maxCol) / 2,
    row: (bounds.minRow + bounds.maxRow) / 2,
  };
  const scaleHole = (hole: Hole) => ({
    col: Math.round(center.col + (hole.col - center.col) * scale),
    row: Math.round(center.row + (hole.row - center.row) * scale),
  });
  const nextStitches = editable.layer.stitches.map((stitch) => ({
    ...stitch,
    from: scaleHole(stitch.from),
    to: scaleHole(stitch.to),
  }));
  return validateLayerEdit(
    project,
    replaceLayerStitches(project, editable.layer.id, nextStitches),
  );
}

export function recolorActiveLayer(
  project: Project,
  colorRoleId: string,
): LayerTransformResult {
  const editable = getEditableActiveLayer(project);
  if (!editable.ok) return { ok: false, reason: editable.reason } satisfies LayerTransformResult;
  return {
    ok: true,
    project: updateLayer(project, editable.layer.id, (layer) => ({
      ...layer,
      stitches: layer.stitches.map((stitch) => ({ ...stitch, colorRoleId })),
    })),
  };
}
