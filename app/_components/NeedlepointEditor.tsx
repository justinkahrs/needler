"use client";

import {
  Check,
  Crop,
  Download,
  Eraser,
  FileText,
  ImageOff,
  ImagePlus,
  Layers3,
  LoaderCircle,
  Maximize2,
  Minus,
  Move,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pipette,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  ScanLine,
  Share2,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import ColorwayStudio from "@/app/_components/ColorwayStudio";
import ShareProjectPanel from "@/app/_components/ShareProjectPanel";
import { DMC_COLORS } from "@/app/_data/dmcColors";
import type { DmcColor } from "@/app/_data/dmcColors";
import {
  LEGACY_PROJECT_STORAGE_KEY,
  PREVIOUS_PROJECT_STORAGE_KEY,
  PROJECT_STORAGE_KEY,
  deserializeProject,
  serializeProject,
} from "@/app/_lib/persistence";
import {
  addPaletteColors,
  buildResolvedRolePalette,
  ensureColorRole,
  getUsedResolvedColors,
  getUsedColorRoles,
  makeEmptyColorState,
} from "@/app/_lib/colorways";
import type { PatternPdfProgress } from "@/app/_lib/patternPdf";
import {
  ShareProjectError,
  decodeShareProject,
  getShareTokenFromHash,
} from "@/app/_lib/shareProject";
import type { DecodedShareProject } from "@/app/_lib/shareProject";
import {
  getActiveReferenceImage,
  makeReferenceImageState,
  nextActiveReferenceImageIdAfterRemoval,
  updateReferenceImage,
} from "@/app/_lib/referenceImages";
import type { ReferenceImageState } from "@/app/_lib/referenceImages";
import {
  MAX_HOLE_STRAND_UNITS,
  canAddStitch,
  canAddStitchWithLoadMap,
  getHoleLoadMap,
  holeKey,
} from "@/app/_lib/needlepointRules";
import type {
  Hole,
  PaletteColor,
  PatternDirection,
  PatternDraft,
  PatternPaperSize,
  PatternProgress,
  PatternSettings,
  Project,
  ReferenceTransform,
  Stitch,
} from "@/app/_lib/needlepointTypes";
import {
  applyViewportGesture,
  classifyReferenceGesture,
  degreesToRadians,
  distanceBetween,
  getDoubleTapView,
  getGestureFrame,
  normalizeViewRotation,
  screenToWorldPoint,
  zoomViewAtPoint,
} from "@/app/_lib/gestureView";
import type {
  GestureFrame,
  GesturePoint as Point,
  GestureViewState as ViewState,
  ReferenceGestureIntent,
} from "@/app/_lib/gestureView";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

type Tool = "stitch" | "erase" | "pan" | "image" | "eyedropper";
type PreviewMode = "image" | "pattern" | "both";
type RightPanelMode = "inspector" | "colorways" | "share";
type DragState = { from: Hole; to: Hole | null } | null;
type PanDragState =
  | {
      pointerId: number;
      start: Point;
      origin: Point;
    }
  | null;
type ImageDragState =
  | {
      pointerId: number;
      startWorld: Point;
      origin: Point;
    }
  | null;
type StagePointer = {
  pointerId: number;
  pointerType: string;
  point: Point;
};
type StageGestureSession = {
  startFrame: GestureFrame;
  startView: ViewState;
  intent: ReferenceGestureIntent;
  startReference:
    | {
        scale: number;
        translateX: number;
        translateY: number;
      }
    | null;
};
type StageTapCandidate = {
  pointerId: number;
  start: Point;
  moved: boolean;
};
type NoticeTone = "info" | "warn" | "success";
type Notice = { id: number; message: string; tone: NoticeTone };
type PatternJobState =
  | { status: "idle" }
  | { status: "working"; progress: PatternProgress }
  | { status: "error"; message: string };
type PdfJobState =
  | { status: "idle" }
  | { status: "working"; progress: PatternPdfProgress }
  | { status: "error"; message: string };
type HoleFill = {
  load: number;
  red: number;
  green: number;
  blue: number;
};

type CanvasBuffer = HTMLCanvasElement | OffscreenCanvas;
type RenderedReferenceImage = {
  image: HTMLImageElement;
  state: ReferenceImageState;
};
type SheetLayerCache = {
  underlay: CanvasBuffer;
  overlay: CanvasBuffer;
  width: number;
  height: number;
  margin: number;
};
type WorldBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type EditorState = {
  project: Project;
  past: Project[];
  future: Project[];
  hydrated: boolean;
};

type EditorAction =
  | { type: "hydrate"; project: Project }
  | { type: "commit"; project: Project }
  | { type: "undo" }
  | { type: "redo" };

const MAX_HISTORY = 100;
const SHEET_WIDTH_IN = 9;
const SHEET_HEIGHT_IN = 12;
const SHEET_MESH_COUNT = 14;
const SHEET_COLS = SHEET_WIDTH_IN * SHEET_MESH_COUNT + 1;
const SHEET_ROWS = SHEET_HEIGHT_IN * SHEET_MESH_COUNT + 1;
const DEFAULT_STRAND_COUNT = 6;
const DISPLAY_PIXELS_PER_INCH = 252;
const DMC_STRAND_DIAMETER_INCH = 0.0265;
const MIN_ZOOM = 0.12;
const MAX_ZOOM = 2.7;
const REFERENCE_MIN_SCALE = 0.25;
const REFERENCE_MAX_SCALE = 4;
const DOUBLE_TAP_MAX_DELAY_MS = 320;
const DOUBLE_TAP_MAX_DISTANCE = 34;
const TAP_MOVE_TOLERANCE = 8;
const MAX_STAGE_RENDER_SCALE = 2;
const SHEET_CACHE_MARGIN = 36;
const EXPORT_SCALE = 3;
const PATTERN_SAMPLE_SCALE = 4;
const DEFAULT_PATTERN_SETTINGS: PatternSettings = {
  maxColors: 16,
  detail: "medium",
  strands: DEFAULT_STRAND_COUNT,
  direction: "slash",
  backgroundTolerance: 10,
};

const DMC_BY_FLOSS = new Map(DMC_COLORS.map((color) => [color.floss, color]));
const DEFAULT_DMC_FLOSS = [
  "3848",
  "3811",
  "B5200",
  "White",
  "Ecru",
  "3011",
  "3012",
  "730",
  "321",
  "304",
  "729",
  "3829",
];
const LEGACY_COLOR_TO_DMC: Record<string, string> = {
  "reef-teal": "3848",
  "sea-glass": "3811",
  linen: "Ecru",
  "olive-stem": "3011",
  "sage-shadow": "3012",
  "madder-red": "321",
  "antique-gold": "729",
};

function dmcColorId(floss: string) {
  return `dmc-${floss}`;
}

function uniqueEntityId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function paletteColorFromDmc(color: DmcColor): PaletteColor {
  return {
    id: dmcColorId(color.floss),
    name: color.name,
    hex: color.hex,
    floss: color.floss,
    source: "dmc",
  };
}

function getDmcPaletteColor(floss: string) {
  const color = DMC_BY_FLOSS.get(floss);

  return color ? paletteColorFromDmc(color) : null;
}

const DEFAULT_PALETTE: PaletteColor[] = DEFAULT_DMC_FLOSS.map(
  getDmcPaletteColor,
).filter((color): color is PaletteColor => Boolean(color));

const INITIAL_SELECTED_COLOR_ID = DEFAULT_PALETTE[0].id;

function makeSheetCanvas(): Project["canvas"] {
  return {
    cols: SHEET_COLS,
    rows: SHEET_ROWS,
    meshCount: SHEET_MESH_COUNT,
    widthIn: SHEET_WIDTH_IN,
    heightIn: SHEET_HEIGHT_IN,
    material: "perforated-paper",
  };
}

function makeDefaultProject(): Project {
  return {
    version: 2,
    canvas: makeSheetCanvas(),
    palette: DEFAULT_PALETTE.map((color) => ({ ...color })),
    stitches: [],
    colors: makeEmptyColorState(),
  };
}

function getPaletteLabel(color: PaletteColor) {
  return color.floss ? `DMC ${color.floss} ${color.name}` : color.name;
}

function normalizeProject(project: Project): Project {
  const paletteById = new Map<string, PaletteColor>();
  const migrateColorId = (colorId: string) => {
    const migratedDmc = LEGACY_COLOR_TO_DMC[colorId];
    return migratedDmc ? dmcColorId(migratedDmc) : colorId;
  };

  for (const color of project.palette) {
    const migratedDmc = LEGACY_COLOR_TO_DMC[color.id];
    const nextColor = migratedDmc ? getDmcPaletteColor(migratedDmc) : color;

    if (nextColor) {
      paletteById.set(nextColor.id, nextColor);
    }
  }

  for (const color of DEFAULT_PALETTE) {
    if (!paletteById.has(color.id)) {
      paletteById.set(color.id, color);
    }
  }

  const canvas = makeSheetCanvas();
  const roles = project.colors.roles.map((role) => ({
    ...role,
    originalColorId: migrateColorId(role.originalColorId),
  }));
  const roleIds = new Set(roles.map((role) => role.id));
  for (const stitch of project.stitches) {
    if (!roleIds.has(stitch.colorRoleId)) {
      roles.push({
        id: stitch.colorRoleId,
        originalColorId: migrateColorId(stitch.colorRoleId),
      });
      roleIds.add(stitch.colorRoleId);
    }
  }
  const migrateAssignments = (assignments: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(assignments).map(([roleId, colorId]) => [
        roleId,
        migrateColorId(colorId),
      ]),
    );

  return {
    ...project,
    version: 2,
    canvas,
    palette: [...paletteById.values()],
    stitches: project.stitches
      .map((stitch) => {
        const nextStrands =
          stitch.strands ?? getLegacyStrandsFromThickness(stitch.thickness);

        return {
          ...stitch,
          strands: nextStrands,
          thickness: getThreadWidthForStrands(nextStrands),
        };
      })
      .filter(
        (stitch) =>
          isHoleWithinCanvas(stitch.from, canvas) &&
          isHoleWithinCanvas(stitch.to, canvas),
      ),
    colors: {
      roles,
      current: migrateAssignments(project.colors.current),
      colorways: project.colors.colorways.map((colorway) => ({
        ...colorway,
        assignments: migrateAssignments(colorway.assignments),
      })),
      activeColorwayId: project.colors.activeColorwayId,
    },
  };
}

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "hydrate":
      return {
        project: action.project,
        past: [],
        future: [],
        hydrated: true,
      };
    case "commit":
      return {
        project: action.project,
        past: [...state.past, state.project].slice(-MAX_HISTORY),
        future: [],
        hydrated: state.hydrated,
      };
    case "undo": {
      const previous = state.past.at(-1);

      if (!previous) {
        return state;
      }

      return {
        ...state,
        project: previous,
        past: state.past.slice(0, -1),
        future: [state.project, ...state.future],
      };
    }
    case "redo": {
      const next = state.future[0];

      if (!next) {
        return state;
      }

      return {
        ...state,
        project: next,
        past: [...state.past, state.project].slice(-MAX_HISTORY),
        future: state.future.slice(1),
      };
    }
  }
}

function getMeshCount(canvas: Project["canvas"]) {
  return canvas.meshCount ?? SHEET_MESH_COUNT;
}

function getGridSpacing(canvas: Project["canvas"]) {
  return DISPLAY_PIXELS_PER_INCH / getMeshCount(canvas);
}

function getGridPadding(canvas: Project["canvas"]) {
  return Math.max(24, getGridSpacing(canvas) * 1.65);
}

function getHoleRadius(canvas: Project["canvas"]) {
  return clamp(getGridSpacing(canvas) * 0.19, 2.4, 5.8);
}

function getThreadWidthForStrands(strands: number) {
  return (
    Math.sqrt(strands) *
    DMC_STRAND_DIAMETER_INCH *
    DISPLAY_PIXELS_PER_INCH *
    1.04
  );
}

function getLegacyStrandsFromThickness(thickness: number) {
  const strandWidth =
    DMC_STRAND_DIAMETER_INCH * DISPLAY_PIXELS_PER_INCH * 1.04;
  const strands = Math.round((thickness / strandWidth) ** 2);

  return clamp(strands || DEFAULT_STRAND_COUNT, 1, 8);
}

function getStitchWidth(stitch: Stitch) {
  return stitch.strands
    ? getThreadWidthForStrands(stitch.strands)
    : stitch.thickness;
}

function getStitchStrands(stitch: Stitch) {
  return stitch.strands ?? getLegacyStrandsFromThickness(stitch.thickness);
}

function getWorldSize(canvas: Project["canvas"]) {
  const spacing = getGridSpacing(canvas);
  const padding = getGridPadding(canvas);

  return {
    width: (canvas.cols - 1) * spacing + padding * 2,
    height: (canvas.rows - 1) * spacing + padding * 2,
  };
}

function getWorldCenter(canvas: Project["canvas"]): Point {
  const world = getWorldSize(canvas);

  return { x: world.width / 2, y: world.height / 2 };
}

function holeToWorld(hole: Hole, canvas: Project["canvas"]): Point {
  const spacing = getGridSpacing(canvas);
  const padding = getGridPadding(canvas);

  return {
    x: padding + hole.col * spacing,
    y: padding + hole.row * spacing,
  };
}

function getRotatedWorldBounds(canvas: Project["canvas"], rotation: number) {
  const world = getWorldSize(canvas);
  const radians = degreesToRadians(rotation);
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));

  return {
    width: world.width * cos + world.height * sin,
    height: world.width * sin + world.height * cos,
  };
}

function applyViewTransform(
  ctx: CanvasRenderingContext2D,
  view: ViewState,
  canvas: Project["canvas"],
) {
  const center = getWorldCenter(canvas);

  ctx.translate(view.pan.x, view.pan.y);
  ctx.rotate(degreesToRadians(view.rotation));
  ctx.scale(view.zoom, view.zoom);
  ctx.translate(-center.x, -center.y);
}

function screenToWorld(
  point: Point,
  view: ViewState,
  canvas: Project["canvas"],
): Point {
  return screenToWorldPoint(point, view, getWorldCenter(canvas));
}

function getVisibleWorldBounds(
  view: ViewState,
  viewport: Point,
  canvas: Project["canvas"],
  screenPadding = 96,
): WorldBounds | null {
  if (viewport.x <= 0 || viewport.y <= 0) {
    return null;
  }

  const corners = [
    screenToWorld({ x: 0, y: 0 }, view, canvas),
    screenToWorld({ x: viewport.x, y: 0 }, view, canvas),
    screenToWorld({ x: viewport.x, y: viewport.y }, view, canvas),
    screenToWorld({ x: 0, y: viewport.y }, view, canvas),
  ];
  const padding = screenPadding / Math.max(view.zoom, MIN_ZOOM);

  return {
    minX: Math.min(...corners.map((point) => point.x)) - padding,
    minY: Math.min(...corners.map((point) => point.y)) - padding,
    maxX: Math.max(...corners.map((point) => point.x)) + padding,
    maxY: Math.max(...corners.map((point) => point.y)) + padding,
  };
}

function segmentIntersectsBounds(
  start: Point,
  end: Point,
  bounds: WorldBounds | null | undefined,
  margin = 0,
) {
  if (!bounds) {
    return true;
  }

  return !(
    Math.max(start.x, end.x) < bounds.minX - margin ||
    Math.min(start.x, end.x) > bounds.maxX + margin ||
    Math.max(start.y, end.y) < bounds.minY - margin ||
    Math.min(start.y, end.y) > bounds.maxY + margin
  );
}

function pointIntersectsBounds(
  point: Point,
  bounds: WorldBounds | null | undefined,
  margin = 0,
) {
  if (!bounds) {
    return true;
  }

  return (
    point.x >= bounds.minX - margin &&
    point.x <= bounds.maxX + margin &&
    point.y >= bounds.minY - margin &&
    point.y <= bounds.maxY + margin
  );
}

function nearestHole(point: Point, canvas: Project["canvas"]): Hole | null {
  const spacing = getGridSpacing(canvas);
  const padding = getGridPadding(canvas);
  const col = Math.round((point.x - padding) / spacing);
  const row = Math.round((point.y - padding) / spacing);

  if (col < 0 || row < 0 || col >= canvas.cols || row >= canvas.rows) {
    return null;
  }

  const snapped = holeToWorld({ col, row }, canvas);
  const distance = Math.hypot(point.x - snapped.x, point.y - snapped.y);

  return distance <= spacing * 0.78 ? { col, row } : null;
}

function isHoleWithinCanvas(hole: Hole, canvas: Project["canvas"]) {
  return (
    hole.col >= 0 &&
    hole.row >= 0 &&
    hole.col < canvas.cols &&
    hole.row < canvas.rows
  );
}

function sameHole(a: Hole | null, b: Hole | null) {
  return Boolean(a && b && a.col === b.col && a.row === b.row);
}

function addHoleFill(
  fillMap: Map<string, HoleFill>,
  hole: Hole,
  strands: number,
  color: string,
) {
  const key = holeKey(hole);
  const rgb = hexToRgb(color);
  const current = fillMap.get(key) ?? { load: 0, red: 0, green: 0, blue: 0 };

  fillMap.set(key, {
    load: current.load + strands,
    red: current.red + rgb.r * strands,
    green: current.green + rgb.g * strands,
    blue: current.blue + rgb.b * strands,
  });
}

function getHoleFillMap(
  project: Project,
  rolePalette = buildResolvedRolePalette(project),
) {
  const fillMap = new Map<string, HoleFill>();

  for (const stitch of project.stitches) {
    const strands = getStitchStrands(stitch);
    const color = rolePalette.get(stitch.colorRoleId)?.hex ?? project.palette[0]?.hex;

    if (!color) {
      continue;
    }

    addHoleFill(fillMap, stitch.from, strands, color);
    addHoleFill(fillMap, stitch.to, strands, color);
  }

  return fillMap;
}

function getClientPoint(
  event: { clientX: number; clientY: number },
  stage: HTMLElement | null,
): Point | null {
  if (!stage) {
    return null;
  }

  const rect = stage.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildPaletteMap(palette: PaletteColor[]) {
  return new Map(palette.map((color) => [color.id, color]));
}

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  const normalized =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value;
  const numeric = Number.parseInt(normalized, 16);

  return {
    r: (numeric >> 16) & 255,
    g: (numeric >> 8) & 255,
    b: numeric & 255,
  };
}

function rgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function shiftHex(hex: string, amount: number) {
  const { r, g, b } = hexToRgb(hex);
  const shift = (channel: number) => clamp(channel + amount, 0, 255);
  const toHex = (channel: number) => shift(channel).toString(16).padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function threadCapsulePath(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  radius: number,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const normal = { x: -dy / length, y: dx / length };
  const normalAngle = Math.atan2(normal.y, normal.x);

  ctx.beginPath();
  ctx.moveTo(start.x + normal.x * radius, start.y + normal.y * radius);
  ctx.lineTo(end.x + normal.x * radius, end.y + normal.y * radius);
  ctx.arc(end.x, end.y, radius, normalAngle, normalAngle - Math.PI, true);
  ctx.lineTo(start.x - normal.x * radius, start.y - normal.y * radius);
  ctx.arc(
    start.x,
    start.y,
    radius,
    normalAngle - Math.PI,
    normalAngle,
    true,
  );
  ctx.closePath();
}

function getStageRenderScale() {
  if (typeof window === "undefined") {
    return 1;
  }

  return clamp(window.devicePixelRatio || 1, 1, MAX_STAGE_RENDER_SCALE);
}

function prepareCanvas(
  canvas: HTMLCanvasElement | null,
  viewport: Point,
  renderScale: number,
): CanvasRenderingContext2D | null {
  if (!canvas || viewport.x <= 0 || viewport.y <= 0) {
    return null;
  }

  const dpr = clamp(renderScale || 1, 1, MAX_STAGE_RENDER_SCALE);
  const width = Math.floor(viewport.x);
  const height = Math.floor(viewport.y);
  const pixelWidth = Math.max(1, Math.floor(width * dpr));
  const pixelHeight = Math.max(1, Math.floor(height * dpr));

  if (canvas.width !== pixelWidth) {
    canvas.width = pixelWidth;
  }
  if (canvas.height !== pixelHeight) {
    canvas.height = pixelHeight;
  }

  const styleWidth = `${width}px`;
  const styleHeight = `${height}px`;
  if (canvas.style.width !== styleWidth) {
    canvas.style.width = styleWidth;
  }
  if (canvas.style.height !== styleHeight) {
    canvas.style.height = styleHeight;
  }

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return null;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  return ctx;
}

function createCanvasBuffer(width: number, height: number): CanvasBuffer | null {
  const pixelWidth = Math.max(1, Math.ceil(width));
  const pixelHeight = Math.max(1, Math.ceil(height));

  if (typeof OffscreenCanvas !== "undefined") {
    try {
      const canvas = new OffscreenCanvas(pixelWidth, pixelHeight);

      if (canvas.getContext("2d")) {
        return canvas;
      }
    } catch {
      // Fall back to a DOM canvas below.
    }
  }

  if (typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;

  return canvas;
}

function getCanvasBufferContext(buffer: CanvasBuffer) {
  return buffer.getContext("2d") as CanvasRenderingContext2D | null;
}

function getPatternBounds(canvas: Project["canvas"]) {
  const spacing = getGridSpacing(canvas);
  const padding = getGridPadding(canvas);

  return {
    x: padding,
    y: padding,
    width: (canvas.cols - 1) * spacing,
    height: (canvas.rows - 1) * spacing,
  };
}

function drawReferenceImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  target: { x: number; y: number; width: number; height: number },
  reference: ReferenceImageState,
  opacity = reference.opacity,
) {
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;

  if (imageWidth <= 0 || imageHeight <= 0) {
    return;
  }

  const isQuarterTurn = reference.transform.rotation % 180 !== 0;
  const rotatedWidth = isQuarterTurn ? imageHeight : imageWidth;
  const rotatedHeight = isQuarterTurn ? imageWidth : imageHeight;
  const fitScale = Math.min(
    target.width / rotatedWidth,
    target.height / rotatedHeight,
  );
  const fillScale = Math.max(
    target.width / rotatedWidth,
    target.height / rotatedHeight,
  );
  const scale =
    (reference.fit === "fit" ? fitScale : fillScale) * reference.transform.scale;

  ctx.save();
  ctx.beginPath();
  ctx.rect(target.x, target.y, target.width, target.height);
  ctx.clip();
  ctx.globalAlpha = clamp(opacity, 0, 1);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(
    target.x + target.width / 2 + reference.transform.translateX * target.width,
    target.y + target.height / 2 + reference.transform.translateY * target.height,
  );
  ctx.rotate(degreesToRadians(reference.transform.rotation));
  ctx.drawImage(
    image,
    (-imageWidth * scale) / 2,
    (-imageHeight * scale) / 2,
    imageWidth * scale,
    imageHeight * scale,
  );
  ctx.restore();
}

function drawPerforatedSheet(
  ctx: CanvasRenderingContext2D,
  project: Project,
  referenceImages: RenderedReferenceImage[] = [],
) {
  drawPerforatedSheetUnderlay(ctx, project.canvas);

  for (const referenceImage of referenceImages) {
    drawReferenceImage(
      ctx,
      referenceImage.image,
      getPatternBounds(project.canvas),
      referenceImage.state,
    );
  }

  drawPerforatedSheetOverlay(ctx, project.canvas);
}

function drawPerforatedSheetUnderlay(
  ctx: CanvasRenderingContext2D,
  canvas: Project["canvas"],
) {
  const world = getWorldSize(canvas);

  ctx.save();
  ctx.shadowColor = "rgba(80, 48, 28, 0.16)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 10;
  roundedRect(ctx, 0, 0, world.width, world.height, 8);
  ctx.fillStyle = "#e6c7b2";
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedRect(ctx, 0, 0, world.width, world.height, 8);
  ctx.clip();

  const fiberGradient = ctx.createLinearGradient(0, 0, world.width, world.height);
  fiberGradient.addColorStop(0, "rgba(255, 255, 255, 0.28)");
  fiberGradient.addColorStop(0.46, "rgba(255, 255, 255, 0)");
  fiberGradient.addColorStop(1, "rgba(87, 52, 34, 0.11)");
  ctx.fillStyle = fiberGradient;
  ctx.fillRect(0, 0, world.width, world.height);
  ctx.restore();
}

function drawPerforatedSheetOverlay(
  ctx: CanvasRenderingContext2D,
  canvas: Project["canvas"],
) {
  const world = getWorldSize(canvas);
  const holeRadius = getHoleRadius(canvas);

  ctx.save();
  roundedRect(ctx, 0, 0, world.width, world.height, 8);
  ctx.clip();

  for (let y = 8; y < world.height; y += 13) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(world.width, y + 10);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  for (let row = 0; row < canvas.rows; row += 1) {
    for (let col = 0; col < canvas.cols; col += 1) {
      const point = holeToWorld({ col, row }, canvas);

      ctx.beginPath();
      ctx.arc(point.x, point.y, holeRadius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(91, 61, 49, 0.78)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(point.x - 0.55, point.y - 0.55, holeRadius + 0.25, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 246, 235, 0.52)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  ctx.strokeStyle = "rgba(96, 62, 44, 0.26)";
  ctx.lineWidth = 1;
  roundedRect(ctx, 0.5, 0.5, world.width - 1, world.height - 1, 8);
  ctx.stroke();

  ctx.restore();
}

const sheetLayerCache = new WeakMap<Project["canvas"], SheetLayerCache>();

function renderSheetCacheLayer(
  buffer: CanvasBuffer,
  margin: number,
  drawLayer: (ctx: CanvasRenderingContext2D) => void,
) {
  const ctx = getCanvasBufferContext(buffer);

  if (!ctx) {
    return false;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, buffer.width, buffer.height);
  ctx.save();
  ctx.translate(margin, margin);
  drawLayer(ctx);
  ctx.restore();

  return true;
}

function getSheetLayerCache(canvas: Project["canvas"]) {
  const cached = sheetLayerCache.get(canvas);

  if (cached) {
    return cached;
  }

  const world = getWorldSize(canvas);
  const margin = SHEET_CACHE_MARGIN;
  const width = Math.ceil(world.width + margin * 2);
  const height = Math.ceil(world.height + margin * 2);
  const underlay = createCanvasBuffer(width, height);
  const overlay = createCanvasBuffer(width, height);

  if (!underlay || !overlay) {
    return null;
  }

  const didRenderUnderlay = renderSheetCacheLayer(underlay, margin, (ctx) =>
    drawPerforatedSheetUnderlay(ctx, canvas),
  );
  const didRenderOverlay = renderSheetCacheLayer(overlay, margin, (ctx) =>
    drawPerforatedSheetOverlay(ctx, canvas),
  );

  if (!didRenderUnderlay || !didRenderOverlay) {
    return null;
  }

  const cache = { underlay, overlay, width, height, margin };
  sheetLayerCache.set(canvas, cache);

  return cache;
}

function drawCachedPerforatedSheet(
  ctx: CanvasRenderingContext2D,
  project: Project,
  referenceImages: RenderedReferenceImage[] = [],
) {
  const cache = getSheetLayerCache(project.canvas);

  if (!cache) {
    drawPerforatedSheet(ctx, project, referenceImages);
    return;
  }

  ctx.drawImage(
    cache.underlay,
    -cache.margin,
    -cache.margin,
    cache.width,
    cache.height,
  );

  for (const referenceImage of referenceImages) {
    drawReferenceImage(
      ctx,
      referenceImage.image,
      getPatternBounds(project.canvas),
      referenceImage.state,
    );
  }

  ctx.drawImage(
    cache.overlay,
    -cache.margin,
    -cache.margin,
    cache.width,
    cache.height,
  );
}

function drawThreadStitch(
  ctx: CanvasRenderingContext2D,
  stitch: Stitch,
  color: string,
  canvas: Project["canvas"],
  alpha = 1,
) {
  const start = holeToWorld(stitch.from, canvas);
  const end = holeToWorld(stitch.to, canvas);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const direction = { x: dx / length, y: dy / length };
  const normal = { x: -dy / length, y: dx / length };
  const threadWidth = getStitchWidth(stitch);
  const capExtension = Math.min(getHoleRadius(canvas) * 0.68, threadWidth * 0.2);
  const renderStart = {
    x: start.x - direction.x * capExtension,
    y: start.y - direction.y * capExtension,
  };
  const renderEnd = {
    x: end.x + direction.x * capExtension,
    y: end.y + direction.y * capExtension,
  };
  const strandExtension = threadWidth * 0.72;
  const strandStart = {
    x: renderStart.x - direction.x * strandExtension,
    y: renderStart.y - direction.y * strandExtension,
  };
  const strandEnd = {
    x: renderEnd.x + direction.x * strandExtension,
    y: renderEnd.y + direction.y * strandExtension,
  };
  const strandMiddle = {
    x: (strandStart.x + strandEnd.x) / 2,
    y: (strandStart.y + strandEnd.y) / 2,
  };
  const ridgeCount = clamp(Math.round((stitch.strands ?? 6) + 1), 4, 10);
  const baseWidth = Math.max(1.45, threadWidth / ridgeCount);
  const seed = hashString(stitch.id);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(56, 33, 21, 0.22)";
  ctx.shadowBlur = 2.2;
  ctx.shadowOffsetY = 1.2;
  ctx.strokeStyle = rgba(color, 0.42);
  ctx.lineWidth = threadWidth + 2.4;
  ctx.beginPath();
  ctx.moveTo(renderStart.x, renderStart.y);
  ctx.lineTo(renderEnd.x, renderEnd.y);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = alpha;
  threadCapsulePath(ctx, renderStart, renderEnd, threadWidth / 2);
  ctx.clip();
  ctx.lineCap = "butt";
  ctx.lineJoin = "round";

  for (let index = 0; index < ridgeCount; index += 1) {
    const spread = index - (ridgeCount - 1) / 2;
    const jitter = Math.sin(seed + index * 1.7) * 0.42;
    const offset = spread * baseWidth * 0.88 + jitter;
    const curve = Math.cos(seed * 0.12 + index) * 0.75;
    const shade = index % 2 === 0 ? shiftHex(color, 15) : shiftHex(color, -10);

    ctx.strokeStyle = shade;
    ctx.lineWidth = baseWidth * 1.18;
    ctx.beginPath();
    ctx.moveTo(strandStart.x + normal.x * offset, strandStart.y + normal.y * offset);
    ctx.quadraticCurveTo(
      strandMiddle.x + normal.x * (offset + curve),
      strandMiddle.y + normal.y * (offset + curve),
      strandEnd.x + normal.x * offset,
      strandEnd.y + normal.y * offset,
    );
    ctx.stroke();
  }

  ctx.globalAlpha = alpha * 0.42;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(strandStart.x + normal.x * -2, strandStart.y + normal.y * -2);
  ctx.lineTo(strandEnd.x + normal.x * -2, strandEnd.y + normal.y * -2);
  ctx.stroke();
  ctx.restore();
}

function drawHoleThreadFill(
  ctx: CanvasRenderingContext2D,
  project: Project,
  fillMap = getHoleFillMap(project),
  visibleBounds?: WorldBounds | null,
) {
  const holeRadius = getHoleRadius(project.canvas);

  for (const [key, fill] of fillMap) {
    if (fill.load <= 0) {
      continue;
    }

    const [col, row] = key.split(":").map(Number);
    const point = holeToWorld({ col, row }, project.canvas);
    if (!pointIntersectsBounds(point, visibleBounds, holeRadius * 2)) {
      continue;
    }

    const loadRatio = clamp(fill.load / MAX_HOLE_STRAND_UNITS, 0, 1);
    const radius = holeRadius * (0.42 + loadRatio * 0.52);
    const red = Math.round(fill.red / fill.load);
    const green = Math.round(fill.green / fill.load);
    const blue = Math.round(fill.blue / fill.load);

    ctx.save();
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${0.38 + loadRatio * 0.32})`;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(point.x, point.y, radius * 0.82, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(52, 34, 24, ${0.08 + loadRatio * 0.13})`;
    ctx.fill();

    if (loadRatio >= 0.66) {
      ctx.beginPath();
      ctx.arc(
        point.x - radius * 0.22,
        point.y - radius * 0.22,
        radius * 0.42,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = "rgba(255, 248, 239, 0.16)";
      ctx.fill();
    }

    ctx.restore();
  }
}

type DenseStitchGroup = {
  path: Path2D;
  colorRoleId: string;
  width: number;
};

const denseStitchCache = new WeakMap<Stitch[], DenseStitchGroup[]>();
const denseHoleFillCache = new WeakMap<Project, Map<string, HoleFill>>();
const previewHoleFillCache = new WeakMap<object, Map<string, HoleFill>>();
const draftPathCache = new WeakMap<PatternDraft, DenseStitchGroup[]>();

function getDenseStitchGroups(project: Project) {
  const cached = denseStitchCache.get(project.stitches);
  if (cached) return cached;

  const groups = new Map<string, DenseStitchGroup>();

  for (const stitch of project.stitches) {
    const width = getStitchWidth(stitch);
    const key = `${stitch.colorRoleId}:${width.toFixed(2)}`;
    const group = groups.get(key) ?? {
      path: new Path2D(),
      colorRoleId: stitch.colorRoleId,
      width,
    };
    const start = holeToWorld(stitch.from, project.canvas);
    const end = holeToWorld(stitch.to, project.canvas);
    group.path.moveTo(start.x, start.y);
    group.path.lineTo(end.x, end.y);
    groups.set(key, group);
  }

  const result = [...groups.values()];
  denseStitchCache.set(project.stitches, result);
  return result;
}

function drawDenseStitches(
  ctx: CanvasRenderingContext2D,
  project: Project,
  assignments?: Record<string, string>,
) {
  const groups = getDenseStitchGroups(project);
  const rolePalette = buildResolvedRolePalette(project, assignments);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const group of groups) {
    const color = rolePalette.get(group.colorRoleId)?.hex ?? project.palette[0]?.hex;
    if (!color) continue;
    ctx.save();
    ctx.shadowColor = "rgba(56, 33, 21, 0.2)";
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = 1.1;
    ctx.strokeStyle = rgba(color, 0.42);
    ctx.lineWidth = group.width + 2.2;
    ctx.stroke(group.path);
    ctx.restore();

    ctx.strokeStyle = color;
    ctx.lineWidth = group.width;
    ctx.stroke(group.path);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = Math.max(0.8, group.width * 0.12);
    ctx.stroke(group.path);
  }
  ctx.restore();

  const previewKey = assignments as object | undefined;
  const fillMap = assignments
    ? previewHoleFillCache.get(previewKey!) ?? getHoleFillMap(project, rolePalette)
    : denseHoleFillCache.get(project) ?? getHoleFillMap(project, rolePalette);
  if (assignments) previewHoleFillCache.set(previewKey!, fillMap);
  else denseHoleFillCache.set(project, fillMap);
  drawHoleThreadFill(ctx, project, fillMap);
}

function drawStitches(
  ctx: CanvasRenderingContext2D,
  project: Project,
  assignments?: Record<string, string>,
  visibleBounds?: WorldBounds | null,
) {
  if (project.stitches.length > 1200) {
    drawDenseStitches(ctx, project, assignments);
    return;
  }

  const rolePalette = buildResolvedRolePalette(project, assignments);

  for (const stitch of project.stitches) {
    const color = rolePalette.get(stitch.colorRoleId)?.hex ?? project.palette[0]?.hex;

    if (!color) {
      continue;
    }

    const start = holeToWorld(stitch.from, project.canvas);
    const end = holeToWorld(stitch.to, project.canvas);

    if (segmentIntersectsBounds(start, end, visibleBounds, getStitchWidth(stitch) * 2)) {
      drawThreadStitch(ctx, stitch, color, project.canvas);
    }
  }

  drawHoleThreadFill(
    ctx,
    project,
    getHoleFillMap(project, rolePalette),
    visibleBounds,
  );
}

function getPatternStitchHoles(
  col: number,
  row: number,
  direction: PatternDirection,
) {
  return direction === "slash"
    ? {
        from: { col, row: row + 1 },
        to: { col: col + 1, row },
      }
    : {
        from: { col, row },
        to: { col: col + 1, row: row + 1 },
      };
}

function getDraftGroups(draft: PatternDraft, canvas: Project["canvas"]) {
  const cached = draftPathCache.get(draft);
  if (cached) return cached;
  const groups = draft.colors.map((usage) => ({
    path: new Path2D(),
    colorRoleId: usage.color.id,
    width: getThreadWidthForStrands(draft.settings.strands),
  }));

  for (let index = 0; index < draft.cells.length; index += 1) {
    const colorIndex = draft.cells[index];
    if (colorIndex === 0) continue;
    const col = index % draft.cols;
    const row = Math.floor(index / draft.cols);
    const holes = getPatternStitchHoles(col, row, draft.settings.direction);
    const start = holeToWorld(holes.from, canvas);
    const end = holeToWorld(holes.to, canvas);
    const path = groups[colorIndex - 1]?.path;
    if (!path) continue;
    path.moveTo(start.x, start.y);
    path.lineTo(end.x, end.y);
  }

  draftPathCache.set(draft, groups);
  return groups;
}

function getVisibleDraftGroups(
  draft: PatternDraft,
  canvas: Project["canvas"],
  visibleBounds: WorldBounds,
) {
  const spacing = getGridSpacing(canvas);
  const padding = getGridPadding(canvas);
  const minCol = Math.max(
    0,
    Math.floor((visibleBounds.minX - padding) / spacing) - 2,
  );
  const maxCol = Math.min(
    draft.cols - 1,
    Math.ceil((visibleBounds.maxX - padding) / spacing) + 2,
  );
  const minRow = Math.max(
    0,
    Math.floor((visibleBounds.minY - padding) / spacing) - 2,
  );
  const maxRow = Math.min(
    draft.rows - 1,
    Math.ceil((visibleBounds.maxY - padding) / spacing) + 2,
  );
  const groups = draft.colors.map((usage) => ({
    path: new Path2D(),
    colorRoleId: usage.color.id,
    width: getThreadWidthForStrands(draft.settings.strands),
  }));

  if (maxCol < minCol || maxRow < minRow) {
    return groups;
  }

  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      const index = row * draft.cols + col;
      const colorIndex = draft.cells[index];
      if (colorIndex === 0) continue;
      const holes = getPatternStitchHoles(col, row, draft.settings.direction);
      const start = holeToWorld(holes.from, canvas);
      const end = holeToWorld(holes.to, canvas);

      if (!segmentIntersectsBounds(start, end, visibleBounds, spacing * 2)) {
        continue;
      }

      const path = groups[colorIndex - 1]?.path;
      if (!path) continue;
      path.moveTo(start.x, start.y);
      path.lineTo(end.x, end.y);
    }
  }

  return groups;
}

function drawPatternDraft(
  ctx: CanvasRenderingContext2D,
  draft: PatternDraft,
  canvas: Project["canvas"],
  visibleBounds?: WorldBounds | null,
) {
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const groups = visibleBounds
    ? getVisibleDraftGroups(draft, canvas, visibleBounds)
    : getDraftGroups(draft, canvas);
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    const color = draft.colors[index]?.color.hex;
    if (!color) continue;
    ctx.save();
    ctx.shadowColor = "rgba(56, 33, 21, 0.2)";
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = 1.1;
    ctx.strokeStyle = rgba(color, 0.38);
    ctx.lineWidth = group.width + 2.1;
    ctx.stroke(group.path);
    ctx.restore();
    ctx.strokeStyle = color;
    ctx.lineWidth = group.width;
    ctx.stroke(group.path);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = Math.max(0.8, group.width * 0.11);
    ctx.stroke(group.path);
  }
  ctx.restore();
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function distanceToSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    0,
    1,
  );
  const projection = {
    x: start.x + t * dx,
    y: start.y + t * dy,
  };

  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

type StitchSpatialIndex = Map<string, Stitch[]>;
const stitchSpatialCache = new WeakMap<Project, StitchSpatialIndex>();

function getStitchSpatialIndex(project: Project) {
  const cached = stitchSpatialCache.get(project);
  if (cached) return cached;
  const index: StitchSpatialIndex = new Map();

  for (const stitch of project.stitches) {
    const colDelta = stitch.to.col - stitch.from.col;
    const rowDelta = stitch.to.row - stitch.from.row;
    const steps = Math.max(Math.abs(colDelta), Math.abs(rowDelta), 1);
    const keys = new Set<string>();

    for (let step = 0; step <= steps; step += 1) {
      const ratio = step / steps;
      const col = Math.floor(stitch.from.col + colDelta * ratio);
      const row = Math.floor(stitch.from.row + rowDelta * ratio);
      keys.add(`${col}:${row}`);
    }

    for (const key of keys) {
      const bucket = index.get(key) ?? [];
      bucket.push(stitch);
      index.set(key, bucket);
    }
  }

  stitchSpatialCache.set(project, index);
  return index;
}

function findNearestStitch(
  point: Point,
  project: Project,
  view: ViewState,
): Stitch | null {
  let nearest: { stitch: Stitch; distance: number } | null = null;
  const screenDistance = 13 / view.zoom;
  const spacing = getGridSpacing(project.canvas);
  const padding = getGridPadding(project.canvas);
  const col = Math.floor((point.x - padding) / spacing);
  const row = Math.floor((point.y - padding) / spacing);
  const candidates = new Map<string, Stitch>();
  const spatialIndex = getStitchSpatialIndex(project);

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      for (const stitch of spatialIndex.get(`${col + colOffset}:${row + rowOffset}`) ?? []) {
        candidates.set(stitch.id, stitch);
      }
    }
  }

  for (const stitch of candidates.values()) {
    const distance = distanceToSegment(
      point,
      holeToWorld(stitch.from, project.canvas),
      holeToWorld(stitch.to, project.canvas),
    );
    const threshold = screenDistance + getStitchWidth(stitch) * 0.5;

    if (distance <= threshold && (!nearest || distance < nearest.distance)) {
      nearest = { stitch, distance };
    }
  }

  return nearest?.stitch ?? null;
}

function makeStitch(from: Hole, to: Hole, colorRoleId: string, strands: number) {
  return {
    id: `stitch-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    from,
    to,
    colorRoleId,
    thickness: getThreadWidthForStrands(strands),
    strands,
  };
}

function unitDiagonalCellKey(stitch: Stitch) {
  const colDelta = Math.abs(stitch.to.col - stitch.from.col);
  const rowDelta = Math.abs(stitch.to.row - stitch.from.row);
  return colDelta === 1 && rowDelta === 1
    ? `${Math.min(stitch.from.col, stitch.to.col)}:${Math.min(
        stitch.from.row,
        stitch.to.row,
      )}`
    : null;
}

function addStitchLoad(loadMap: Map<string, number>, hole: Hole, strands: number) {
  const key = holeKey(hole);
  loadMap.set(key, (loadMap.get(key) ?? 0) + strands);
}

function applyPatternDraft(
  project: Project,
  draft: PatternDraft,
  mode: "replace" | "fill",
) {
  const baseStitches = mode === "replace" ? [] : project.stitches;
  const occupied = new Set(
    mode === "fill"
      ? project.stitches
          .map(unitDiagonalCellKey)
          .filter((key): key is string => Boolean(key))
      : [],
  );
  const loadMap = mode === "replace" ? new Map<string, number>() : getHoleLoadMap(project);
  const pendingAdditions: Array<
    Omit<Stitch, "colorRoleId"> & { physicalColorId: string }
  > = [];
  const usedColorIds = new Set<string>();
  let occupiedSkipped = 0;
  let capacitySkipped = 0;
  const batchId = Date.now().toString(36);

  for (let index = 0; index < draft.cells.length; index += 1) {
    const colorIndex = draft.cells[index];
    if (colorIndex === 0) continue;
    const col = index % draft.cols;
    const row = Math.floor(index / draft.cols);
    const cellKey = `${col}:${row}`;

    if (occupied.has(cellKey)) {
      occupiedSkipped += 1;
      continue;
    }

    const color = draft.colors[colorIndex - 1]?.color;
    if (!color) continue;
    const holes = getPatternStitchHoles(col, row, draft.settings.direction);
    const capacity = canAddStitchWithLoadMap(
      loadMap,
      holes.from,
      holes.to,
      draft.settings.strands,
    );

    if (!capacity.canAdd) {
      capacitySkipped += 1;
      continue;
    }

    pendingAdditions.push({
      id: `image-${batchId}-${index.toString(36)}`,
      from: holes.from,
      to: holes.to,
      physicalColorId: color.id,
      strands: draft.settings.strands,
      thickness: getThreadWidthForStrands(draft.settings.strands),
    });
    usedColorIds.add(color.id);
    occupied.add(cellKey);
    addStitchLoad(loadMap, holes.from, draft.settings.strands);
    addStitchLoad(loadMap, holes.to, draft.settings.strands);
  }

  const paletteIds = new Set(project.palette.map((color) => color.id));
  const addedColors = draft.colors
    .map((usage) => usage.color)
    .filter((color) => usedColorIds.has(color.id) && !paletteIds.has(color.id));
  let nextProject = addPaletteColors(project, addedColors);
  const roleByColor = new Map<string, string>();
  for (const colorId of usedColorIds) {
    const ensured = ensureColorRole(nextProject, colorId);
    nextProject = ensured.project;
    roleByColor.set(colorId, ensured.roleId);
  }
  const additions: Stitch[] = pendingAdditions.flatMap((stitch) => {
    const colorRoleId = roleByColor.get(stitch.physicalColorId);
    if (!colorRoleId) return [];
    return [
      {
        id: stitch.id,
        from: stitch.from,
        to: stitch.to,
        strands: stitch.strands,
        thickness: stitch.thickness,
        colorRoleId,
      },
    ];
  });

  return {
    project: {
      ...nextProject,
      stitches: [...baseStitches, ...additions],
    },
    additions: additions.length,
    occupiedSkipped,
    capacitySkipped,
    colorsAdded: addedColors.length,
  };
}

function createExportCanvas(project: Project) {
  const world = getWorldSize(project.canvas);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(world.width * EXPORT_SCALE);
  canvas.height = Math.round(world.height * EXPORT_SCALE);

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return null;
  }

  ctx.setTransform(EXPORT_SCALE, 0, 0, EXPORT_SCALE, 0, 0);
  ctx.clearRect(0, 0, world.width, world.height);
  drawPerforatedSheet(ctx, project);
  drawStitches(ctx, project);

  return canvas;
}

function createPatternSampleCanvas(
  image: HTMLImageElement,
  reference: ReferenceImageState,
  canvasModel: Project["canvas"],
) {
  const canvas = document.createElement("canvas");
  canvas.width = (canvasModel.cols - 1) * PATTERN_SAMPLE_SCALE;
  canvas.height = (canvasModel.rows - 1) * PATTERN_SAMPLE_SCALE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx) return null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawReferenceImage(
    ctx,
    image,
    { x: 0, y: 0, width: canvas.width, height: canvas.height },
    reference,
    1,
  );
  return canvas;
}

function sampleReferenceColor(
  point: Point,
  image: HTMLImageElement,
  reference: ReferenceImageState,
  canvasModel: Project["canvas"],
) {
  const bounds = getPatternBounds(canvasModel);
  const normalizedX = (point.x - bounds.x) / bounds.width;
  const normalizedY = (point.y - bounds.y) / bounds.height;

  if (normalizedX < 0 || normalizedX > 1 || normalizedY < 0 || normalizedY > 1) {
    return null;
  }

  const sampleCanvas = createPatternSampleCanvas(image, reference, canvasModel);
  const ctx = sampleCanvas?.getContext("2d", { willReadFrequently: true });
  if (!sampleCanvas || !ctx) return null;
  const x = clamp(Math.floor(normalizedX * sampleCanvas.width), 0, sampleCanvas.width - 1);
  const y = clamp(Math.floor(normalizedY * sampleCanvas.height), 0, sampleCanvas.height - 1);
  const pixel = ctx.getImageData(x, y, 1, 1).data;
  if (pixel[3] < 31) return null;
  return `#${[pixel[0], pixel[1], pixel[2]]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

async function createPdfPreviewPng(project: Project) {
  const world = getWorldSize(project.canvas);
  const canvas = document.createElement("canvas");
  canvas.width = 450;
  canvas.height = 600;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const scale = Math.min(canvas.width / world.width, canvas.height / world.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawPerforatedSheet(ctx, project);
  drawStitches(ctx, project);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob ? blob.arrayBuffer() : null;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatTimestamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

function clearSharedProjectHash() {
  if (!getShareTokenFromHash(window.location.hash)) return;
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
}

function toolButtonClass(active?: boolean) {
  return [
    "flex h-11 w-11 items-center justify-center rounded-md border text-sm transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-35",
    active
      ? "border-[#7e4e36] bg-[#7e4e36] text-[#fff9f0] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
      : "border-[#d8c4ad] bg-[#fff8ef] text-[#4f392b] hover:border-[#b99b7d] hover:bg-white",
  ].join(" ");
}

function panelButtonClass(variant: "solid" | "quiet" = "quiet") {
  return [
    "inline-flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45",
    variant === "solid"
      ? "border-[#7e4e36] bg-[#7e4e36] text-[#fffaf3] hover:bg-[#6f422d]"
      : "border-[#d8c4ad] bg-[#fff8ef] text-[#4f392b] hover:border-[#b99b7d] hover:bg-white",
  ].join(" ");
}

function NeedleIcon({
  size = 18,
  strokeWidth = 1.8,
}: {
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
    >
      <path d="M19.8 4.2 3.8 20.2" />
      <ellipse cx="18" cy="6" rx="2.7" ry="1.25" transform="rotate(-45 18 6)" />
      <path d="M5.2 18.8 3.8 20.2" />
    </svg>
  );
}

function getToolLabel(tool: Tool) {
  switch (tool) {
    case "stitch":
      return "Stitch";
    case "erase":
      return "Erase";
    case "pan":
      return "Pan";
    case "image":
      return "Image";
    case "eyedropper":
      return "Eyedropper";
  }
}

function getPanelLabel(mode: RightPanelMode) {
  switch (mode) {
    case "inspector":
      return "Inspector";
    case "colorways":
      return "Colorways";
    case "share":
      return "Share";
  }
}

function ToolGlyph({
  tool,
  size = 18,
  strokeWidth = 1.8,
}: {
  tool: Tool;
  size?: number;
  strokeWidth?: number;
}) {
  switch (tool) {
    case "stitch":
      return <NeedleIcon size={size} strokeWidth={strokeWidth} />;
    case "erase":
      return <Eraser size={size} strokeWidth={strokeWidth} />;
    case "pan":
      return <Move size={size} strokeWidth={strokeWidth} />;
    case "image":
      return <Crop size={size} strokeWidth={strokeWidth} />;
    case "eyedropper":
      return <Pipette size={size} strokeWidth={strokeWidth} />;
  }
}

function IconButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={toolButtonClass(active)}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function NeedlepointEditor() {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => ({
    project: makeDefaultProject(),
    past: [],
    future: [],
    hydrated: false,
  }));
  const { project } = state;
  const [selectedColorId, setSelectedColorId] = useState(
    INITIAL_SELECTED_COLOR_ID,
  );
  const [strandCount, setStrandCount] = useState(DEFAULT_STRAND_COUNT);
  const [tool, setTool] = useState<Tool>("stitch");
  const [drag, setDrag] = useState<DragState>(null);
  const [panDrag, setPanDrag] = useState<PanDragState>(null);
  const [imageDrag, setImageDrag] = useState<ImageDragState>(null);
  const [hoverHole, setHoverHole] = useState<Hole | null>(null);
  const [hoveredStitchId, setHoveredStitchId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [quickColorCollapsed, setQuickColorCollapsed] = useState(false);
  const [dmcQuery, setDmcQuery] = useState("");
  const [customHex, setCustomHex] = useState("#c72b3b");
  const [customName, setCustomName] = useState("Custom thread");
  const [viewport, setViewport] = useState<Point>({ x: 0, y: 0 });
  const [stageRenderScale, setStageRenderScale] = useState(1);
  const [view, setView] = useState<ViewState>({
    zoom: 1,
    pan: { x: 0, y: 0 },
    rotation: 0,
  });
  const [referenceImages, setReferenceImages] = useState<ReferenceImageState[]>(
    [],
  );
  const [activeReferenceImageId, setActiveReferenceImageId] = useState<
    string | null
  >(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("both");
  const [patternSettings, setPatternSettings] = useState<PatternSettings>(
    DEFAULT_PATTERN_SETTINGS,
  );
  const [patternDraft, setPatternDraft] = useState<PatternDraft | null>(null);
  const [patternJob, setPatternJob] = useState<PatternJobState>({ status: "idle" });
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [paperSize, setPaperSize] = useState<PatternPaperSize>("letter");
  const [pdfJob, setPdfJob] = useState<PdfJobState>({ status: "idle" });
  const [rightPanelMode, setRightPanelMode] =
    useState<RightPanelMode>("inspector");
  const [toolRailCollapsed, setToolRailCollapsed] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [initialColorwayRoleId, setInitialColorwayRoleId] = useState<
    string | undefined
  >();
  const [colorwayPreview, setColorwayPreview] = useState<Record<
    string,
    string
  > | null>(null);
  const [sharedProjectSource, setSharedProjectSource] = useState<
    "url" | "file" | null
  >(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stitchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const referenceElementMapRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const patternWorkerRef = useRef<Worker | null>(null);
  const pdfWorkerRef = useRef<Worker | null>(null);
  const pdfExportIdRef = useRef(0);
  const hasFitViewRef = useRef(false);
  const localWorkspaceRef = useRef<{ project: Project; rotation: number } | null>(
    null,
  );
  const activePointersRef = useRef<Map<number, StagePointer>>(new Map());
  const gestureSessionRef = useRef<StageGestureSession | null>(null);
  const tapCandidateRef = useRef<StageTapCandidate | null>(null);
  const lastTapRef = useRef<{ point: Point; time: number } | null>(null);
  const viewRef = useRef<ViewState>(view);
  const pendingViewRef = useRef<ViewState | null>(null);
  const viewFrameRef = useRef<number | null>(null);

  const meshCount = getMeshCount(project.canvas);
  const physicalWidth = project.canvas.widthIn;
  const physicalHeight = project.canvas.heightIn;
  const stitchCellsWide = project.canvas.cols - 1;
  const stitchCellsHigh = project.canvas.rows - 1;
  const strandWidth = getThreadWidthForStrands(strandCount);
  const coveragePercent = Math.round(
    (strandWidth / getGridSpacing(project.canvas)) * 100,
  );
  const holeLoadMap = useMemo(() => getHoleLoadMap(project), [project]);
  const maxHoleLoad = useMemo(
    () => Math.max(0, ...holeLoadMap.values()),
    [holeLoadMap],
  );
  const paletteMap = useMemo(() => buildPaletteMap(project.palette), [project.palette]);
  const selectedColor = paletteMap.get(selectedColorId) ?? project.palette[0];
  const activeColorId =
    selectedColor?.id ?? project.palette[0]?.id ?? INITIAL_SELECTED_COLOR_ID;
  const activePreviewColor = selectedColor?.hex ?? "#559392";
  const referenceImage = useMemo(
    () => getActiveReferenceImage(referenceImages, activeReferenceImageId),
    [activeReferenceImageId, referenceImages],
  );
  const resolvedActiveReferenceImageId = referenceImage?.id ?? null;
  const newPatternColors = patternDraft?.colors.filter((usage) => !usage.existing) ?? [];
  const paletteIds = useMemo(
    () => new Set(project.palette.map((color) => color.id)),
    [project.palette],
  );
  const filteredDmcColors = useMemo(() => {
    const query = dmcQuery.trim().toLowerCase();
    const matches = query
      ? DMC_COLORS.filter(
          (color) =>
            color.floss.toLowerCase().includes(query) ||
            color.name.toLowerCase().includes(query),
        )
      : DMC_COLORS;

    return matches.slice(0, 36);
  }, [dmcQuery]);
  const usedColorRoles = useMemo(() => getUsedColorRoles(project), [project]);
  const usedResolvedColors = useMemo(
    () => getUsedResolvedColors(project),
    [project],
  );
  const visibleWorldBounds = useMemo(
    () => getVisibleWorldBounds(view, viewport, project.canvas),
    [project.canvas, view, viewport],
  );
  const threadSwatchColors = useMemo(
    () =>
      usedResolvedColors.length > 0
        ? usedResolvedColors.map((usage) => usage.color)
        : project.palette,
    [project.palette, usedResolvedColors],
  );
  const activeColorwayName =
    project.colors.colorways.find(
      (colorway) => colorway.id === project.colors.activeColorwayId,
    )?.name ??
    (Object.keys(project.colors.current).length > 0 ? "Modified" : "Original");
  const editorStatusLabel = state.hydrated
    ? sharedProjectSource
      ? "Temporary copy"
      : "Saved locally"
    : "Loading";
  const isPdfExporting = pdfJob.status === "working";
  const quickColorOptions = threadSwatchColors.slice(0, 14);

  const notify = useCallback((message: string, tone: NoticeTone = "info") => {
    setNotice({ id: Date.now(), message, tone });
  }, []);

  const clearPatternPreviewState = useCallback(() => {
    patternWorkerRef.current?.terminate();
    patternWorkerRef.current = null;
    setPatternDraft(null);
    setPatternJob({ status: "idle" });
    setReplaceConfirmed(false);
  }, []);

  const selectReferenceImage = useCallback(
    (id: string | null) => {
      if (id === activeReferenceImageId) {
        return;
      }

      setActiveReferenceImageId(id);
      clearPatternPreviewState();
      if (id && tool === "stitch") {
        setTool("image");
      }
    },
    [activeReferenceImageId, clearPatternPreviewState, tool],
  );

  const updateActiveReferenceImage = useCallback(
    (update: (image: ReferenceImageState) => ReferenceImageState) => {
      setReferenceImages((current) =>
        updateReferenceImage(current, resolvedActiveReferenceImageId, update),
      );
      setPatternDraft(null);
      setReplaceConfirmed(false);
    },
    [resolvedActiveReferenceImageId],
  );

  const clearReferenceImageCollection = useCallback(() => {
    patternWorkerRef.current?.terminate();
    patternWorkerRef.current = null;
    referenceElementMapRef.current.clear();
    setReferenceImages([]);
    setActiveReferenceImageId(null);
    setPatternDraft(null);
    setPatternJob({ status: "idle" });
    setReplaceConfirmed(false);
    if (tool === "image" || tool === "eyedropper") setTool("stitch");
  }, [tool]);

  const handleColorwayPreview = useCallback(
    (assignments: Record<string, string> | null) => {
      setColorwayPreview(assignments);
    },
    [],
  );

  const openColorwayStudio = (roleId?: string) => {
    if (patternDraft) {
      notify("Apply or clear the image preview before editing colorways.", "warn");
      return;
    }
    setInitialColorwayRoleId(roleId);
    setPanelCollapsed(false);
    setRightPanelMode("colorways");
  };

  const closeColorwayStudio = () => {
    setColorwayPreview(null);
    setInitialColorwayRoleId(undefined);
    setRightPanelMode("inspector");
  };

  const openSharePanel = () => {
    if (patternDraft) {
      notify("Apply or clear the image preview before sharing.", "warn");
      return;
    }
    setColorwayPreview(null);
    setInitialColorwayRoleId(undefined);
    setPanelCollapsed(false);
    setRightPanelMode("share");
  };

  const commitColorwayProject = (nextProject: Project, message: string) => {
    commitProject(nextProject);
    const nextUsed = getUsedResolvedColors(nextProject);
    if (nextUsed[0]) setSelectedColorId(nextUsed[0].color.id);
    closeColorwayStudio();
    notify(message, "success");
  };

  const getFittedView = useCallback(
    (canvas: Project["canvas"], rotation: number): ViewState => {
      const nextWorld = getRotatedWorldBounds(canvas, rotation);
      const zoom = clamp(
        Math.min(
          Math.max(1, viewport.x - 48) / nextWorld.width,
          Math.max(1, viewport.y - 48) / nextWorld.height,
        ),
        MIN_ZOOM,
        MAX_ZOOM,
      );

      return {
        zoom,
        pan: {
          x: viewport.x / 2,
          y: viewport.y / 2,
        },
        rotation,
      };
    },
    [viewport],
  );

  const updateView = useCallback(
    (
      nextView:
        | ViewState
        | ((current: ViewState) => ViewState),
      immediate = false,
    ) => {
      const current = pendingViewRef.current ?? viewRef.current;
      const resolved =
        typeof nextView === "function" ? nextView(current) : nextView;

      viewRef.current = resolved;
      pendingViewRef.current = resolved;

      if (immediate || typeof window === "undefined") {
        if (viewFrameRef.current !== null) {
          window.cancelAnimationFrame(viewFrameRef.current);
          viewFrameRef.current = null;
        }
        pendingViewRef.current = null;
        setView(resolved);
        return resolved;
      }

      if (viewFrameRef.current === null) {
        viewFrameRef.current = window.requestAnimationFrame(() => {
          viewFrameRef.current = null;
          const pending = pendingViewRef.current;
          pendingViewRef.current = null;

          if (pending) {
            setView(pending);
          }
        });
      }

      return resolved;
    },
    [],
  );

  const fitViewToCanvas = useCallback(
    (canvas: Project["canvas"], rotation?: number) => {
      updateView((current) =>
        getFittedView(canvas, rotation ?? current.rotation),
      );
    },
    [getFittedView, updateView],
  );

  const fitView = useCallback(() => {
    fitViewToCanvas(project.canvas);
  }, [fitViewToCanvas, project.canvas]);

  const zoomAt = useCallback((screenPoint: Point, zoomFactor: number) => {
    updateView((current) => {
      return zoomViewAtPoint({
        view: current,
        screenPoint,
        nextZoom: current.zoom * zoomFactor,
        center: getWorldCenter(project.canvas),
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
      });
    });
  }, [project.canvas, updateView]);

  useEffect(() => {
    if (!pendingViewRef.current) {
      viewRef.current = view;
    }
  }, [view]);

  useEffect(() => {
    return () => {
      if (viewFrameRef.current !== null) {
        window.cancelAnimationFrame(viewFrameRef.current);
      }
    };
  }, []);

  const commitProject = useCallback((nextProject: Project) => {
    dispatch({ type: "commit", project: nextProject });
  }, []);

  useEffect(() => {
    let active = true;

    const hydrateEditor = async () => {
      let loadedProject: Project | null = null;

      try {
        for (const key of [
          PROJECT_STORAGE_KEY,
          PREVIOUS_PROJECT_STORAGE_KEY,
          LEGACY_PROJECT_STORAGE_KEY,
        ]) {
          const savedProject = window.localStorage.getItem(key);
          if (!savedProject) continue;
          loadedProject = deserializeProject(JSON.parse(savedProject) as unknown);
          if (loadedProject) break;
        }
      } catch {
        loadedProject = null;
      }

      const localProject = loadedProject
        ? normalizeProject(loadedProject)
        : makeDefaultProject();
      localWorkspaceRef.current = { project: localProject, rotation: 0 };

      const token = getShareTokenFromHash(window.location.hash);
      if (token) {
        try {
          const shared = await decodeShareProject(token);
          if (!active) return;
          const sharedProject = normalizeProject(shared.project);
          dispatch({ type: "hydrate", project: sharedProject });
          setSharedProjectSource("url");
          updateView((current) => ({
            ...current,
            rotation: shared.rotation,
          }), true);
          hasFitViewRef.current = false;
          const firstUsedColor = getUsedResolvedColors(sharedProject)[0]?.color.id;
          if (firstUsedColor) setSelectedColorId(firstUsedColor);
          notify("Shared project opened as a temporary copy.", "success");
          return;
        } catch (error) {
          if (!active) return;
          notify(
            error instanceof ShareProjectError
              ? error.message
              : "Could not open this shared project.",
            "warn",
          );
        }
      }

      if (active) dispatch({ type: "hydrate", project: localProject });
    };

    void hydrateEditor();
    return () => {
      active = false;
    };
  }, [notify, updateView]);

  useEffect(() => {
    if (!state.hydrated || sharedProjectSource) {
      return;
    }

    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(PROJECT_STORAGE_KEY, serializeProject(project));
      } catch {
        notify("Local storage is not available.", "warn");
      }
    }, 120);

    return () => window.clearTimeout(timeout);
  }, [notify, project, sharedProjectSource, state.hydrated]);

  useEffect(() => {
    if (!state.hydrated || sharedProjectSource) return;
    localWorkspaceRef.current = { project, rotation: viewRef.current.rotation };
  }, [project, sharedProjectSource, state.hydrated, view.rotation]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => setNotice(null), 2400);

    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    return () => {
      patternWorkerRef.current?.terminate();
      pdfWorkerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    const elementMap = referenceElementMapRef.current;
    const currentIds = new Set(referenceImages.map((image) => image.id));

    for (const id of elementMap.keys()) {
      if (!currentIds.has(id)) {
        elementMap.delete(id);
      }
    }

    let isActive = true;

    for (const reference of referenceImages) {
      if (elementMap.has(reference.id)) {
        continue;
      }

      const image = new Image();

      image.onload = () => {
        if (!isActive) {
          return;
        }

        elementMap.set(reference.id, image);
        setReferenceImages((current) =>
          updateReferenceImage(current, reference.id, (state) => ({
            ...state,
            width: image.naturalWidth,
            height: image.naturalHeight,
          })),
        );
      };

      image.onerror = () => {
        if (!isActive) {
          return;
        }

        elementMap.delete(reference.id);
        setReferenceImages((current) =>
          current.filter((imageState) => imageState.id !== reference.id),
        );
        setActiveReferenceImageId((current) =>
          current === reference.id
            ? nextActiveReferenceImageIdAfterRemoval(referenceImages, reference.id)
            : current,
        );
        notify(`Could not load ${reference.name}.`, "warn");
      };

      image.src = reference.src;
    }

    return () => {
      isActive = false;
    };
  }, [notify, referenceImages]);

  useEffect(() => {
    const stage = stageRef.current;

    if (!stage) {
      return;
    }

    const updateSize = () => {
      setViewport({
        x: stage.clientWidth,
        y: stage.clientHeight,
      });
      setStageRenderScale(getStageRenderScale());
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(stage);
    window.addEventListener("resize", updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  useEffect(() => {
    if (!hasFitViewRef.current && viewport.x > 0 && viewport.y > 0) {
      hasFitViewRef.current = true;
      fitView();
    }
  }, [fitView, viewport]);

  useEffect(() => {
    const ctx = prepareCanvas(baseCanvasRef.current, viewport, stageRenderScale);

    if (!ctx) {
      return;
    }

    ctx.save();
    applyViewTransform(ctx, view, project.canvas);
    const renderedReferences =
      previewMode !== "pattern"
        ? referenceImages.flatMap((state) => {
            const image = referenceElementMapRef.current.get(state.id);
            return image ? [{ image, state }] : [];
          })
        : [];
    drawCachedPerforatedSheet(ctx, project, renderedReferences);
    ctx.restore();
  }, [patternDraft, previewMode, project, referenceImages, stageRenderScale, view, viewport]);

  useEffect(() => {
    const ctx = prepareCanvas(stitchCanvasRef.current, viewport, stageRenderScale);

    if (!ctx) {
      return;
    }

    ctx.save();
    applyViewTransform(ctx, view, project.canvas);
    if (!patternDraft) {
      drawStitches(
        ctx,
        project,
        colorwayPreview ?? undefined,
        visibleWorldBounds,
      );
    }
    ctx.restore();
  }, [
    colorwayPreview,
    patternDraft,
    project,
    stageRenderScale,
    view,
    viewport,
    visibleWorldBounds,
  ]);

  useEffect(() => {
    const ctx = prepareCanvas(previewCanvasRef.current, viewport, stageRenderScale);

    if (!ctx) {
      return;
    }

    ctx.save();
    applyViewTransform(ctx, view, project.canvas);
    if (patternDraft && previewMode !== "image") {
      drawPatternDraft(ctx, patternDraft, project.canvas, visibleWorldBounds);
    }
    const dragCapacity =
      drag?.from && drag.to && !sameHole(drag.from, drag.to)
        ? canAddStitchWithLoadMap(holeLoadMap, drag.from, drag.to, strandCount)
        : null;
    const isDragBlocked = dragCapacity?.canAdd === false;

    if (hoveredStitchId) {
      const hovered = project.stitches.find((stitch) => stitch.id === hoveredStitchId);

      if (hovered) {
        const start = holeToWorld(hovered.from, project.canvas);
        const end = holeToWorld(hovered.to, project.canvas);

        ctx.save();
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(126, 78, 54, 0.36)";
        ctx.lineWidth = getStitchWidth(hovered) + 8 / view.zoom;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    if (drag?.from && drag.to && !sameHole(drag.from, drag.to)) {
      drawThreadStitch(
        ctx,
        {
          id: "preview-stitch",
          from: drag.from,
          to: drag.to,
          colorRoleId: "preview-color",
          thickness: strandWidth,
          strands: strandCount,
        },
        isDragBlocked ? "#b0473b" : activePreviewColor,
        project.canvas,
        isDragBlocked ? 0.58 : 0.72,
      );
    }

    const markedHole = drag?.to ?? hoverHole;

    if (markedHole) {
      const point = holeToWorld(markedHole, project.canvas);

      ctx.beginPath();
      ctx.arc(point.x, point.y, getGridSpacing(project.canvas) * 0.38, 0, Math.PI * 2);
      ctx.strokeStyle =
        tool === "erase" || isDragBlocked ? "#b0473b" : activePreviewColor;
      ctx.lineWidth = 2.2 / view.zoom;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(point.x, point.y, 2.4, 0, Math.PI * 2);
      ctx.fillStyle =
        tool === "erase" || isDragBlocked
          ? "rgba(176, 71, 59, 0.72)"
          : activePreviewColor;
      ctx.fill();
    }

    if (drag?.from) {
      const point = holeToWorld(drag.from, project.canvas);

      ctx.beginPath();
      ctx.arc(point.x, point.y, getGridSpacing(project.canvas) * 0.46, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 248, 239, 0.88)";
      ctx.lineWidth = 3 / view.zoom;
      ctx.stroke();
    }

    ctx.restore();
  }, [
    activePreviewColor,
    activeColorId,
    drag,
    hoverHole,
    holeLoadMap,
    hoveredStitchId,
    project.canvas,
    project.stitches,
    patternDraft,
    previewMode,
    strandCount,
    strandWidth,
    tool,
    stageRenderScale,
    view,
    viewport,
    visibleWorldBounds,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (isTyping) {
        return;
      }

      const modKey = event.metaKey || event.ctrlKey;

      if (modKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        setColorwayPreview(null);
        setRightPanelMode("inspector");
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      }

      if (modKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        setColorwayPreview(null);
        setRightPanelMode("inspector");
        dispatch({ type: "redo" });
      }

      if (event.key === "Escape") {
        setDrag(null);
        setPanDrag(null);
        setImageDrag(null);
        setColorwayPreview(null);
        setRightPanelMode("inspector");
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const registerStageTap = (screenPoint: Point, timestamp: number) => {
    const previous = lastTapRef.current;

    if (
      previous &&
      timestamp - previous.time <= DOUBLE_TAP_MAX_DELAY_MS &&
      distanceBetween(previous.point, screenPoint) <= DOUBLE_TAP_MAX_DISTANCE
    ) {
      lastTapRef.current = null;
      updateView((current) => {
        const fitView = getFittedView(project.canvas, current.rotation);
        const workingZoom = Math.max(fitView.zoom * 2.35, 0.9);

        return getDoubleTapView({
          view: current,
          screenPoint,
          center: getWorldCenter(project.canvas),
          fitView,
          workingZoom,
          minZoom: MIN_ZOOM,
          maxZoom: MAX_ZOOM,
        });
      });
      return true;
    }

    lastTapRef.current = { point: screenPoint, time: timestamp };
    return false;
  };

  const clearPendingStageEdits = () => {
    setDrag(null);
    setPanDrag(null);
    setImageDrag(null);
    setHoverHole(null);
    setHoveredStitchId(null);
    tapCandidateRef.current = null;
  };

  const getStageGesturePointers = (): [StagePointer, StagePointer] | null => {
    const pointers = [...activePointersRef.current.values()];

    if (pointers.length < 2) {
      return null;
    }

    const touchPointers = pointers.filter(
      (pointer) => pointer.pointerType === "touch",
    );
    const candidates = touchPointers.length >= 2 ? touchPointers : pointers;

    return [candidates[0], candidates[1]];
  };

  const startStageGesture = () => {
    const pointers = getStageGesturePointers();

    if (!pointers) {
      return false;
    }

    clearPendingStageEdits();
    gestureSessionRef.current = {
      startFrame: getGestureFrame(pointers[0].point, pointers[1].point),
      startView: viewRef.current,
      intent: tool === "image" && referenceImage ? "pending" : "viewport",
      startReference: referenceImage
        ? {
            scale: referenceImage.transform.scale,
            translateX: referenceImage.transform.translateX,
            translateY: referenceImage.transform.translateY,
          }
        : null,
    };

    return true;
  };

  const scaleReferenceImageFromGesture = (
    session: StageGestureSession,
    currentFrame: GestureFrame,
  ) => {
    if (!session.startReference) {
      return;
    }

    const bounds = getPatternBounds(project.canvas);
    const boundsCenter = {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    };
    const startScale = session.startReference.scale || 1;
    const nextScale = clamp(
      startScale * (currentFrame.distance / session.startFrame.distance),
      REFERENCE_MIN_SCALE,
      REFERENCE_MAX_SCALE,
    );
    const scaleRatio = nextScale / startScale;
    const focalPoint = screenToWorld(
      session.startFrame.centroid,
      session.startView,
      project.canvas,
    );
    const startCenter = {
      x: boundsCenter.x + session.startReference.translateX * bounds.width,
      y: boundsCenter.y + session.startReference.translateY * bounds.height,
    };
    const nextCenter = {
      x: focalPoint.x + (startCenter.x - focalPoint.x) * scaleRatio,
      y: focalPoint.y + (startCenter.y - focalPoint.y) * scaleRatio,
    };

    updateActiveReferenceImage((current) => ({
      ...current,
      transform: {
        ...current.transform,
        scale: nextScale,
        translateX: (nextCenter.x - boundsCenter.x) / bounds.width,
        translateY: (nextCenter.y - boundsCenter.y) / bounds.height,
      },
    }));
  };

  const updateStageGesture = () => {
    const session = gestureSessionRef.current;
    const pointers = getStageGesturePointers();

    if (!session || !pointers) {
      return false;
    }

    const currentFrame = getGestureFrame(pointers[0].point, pointers[1].point);
    let intent = session.intent;

    if (intent === "pending") {
      intent = classifyReferenceGesture({
        startFrame: session.startFrame,
        currentFrame,
      });
      session.intent = intent;

      if (intent === "pending") {
        return true;
      }
    }

    if (intent === "image-scale" && tool === "image" && referenceImage) {
      scaleReferenceImageFromGesture(session, currentFrame);
      return true;
    }

    updateView(
      applyViewportGesture({
        startView: session.startView,
        startFrame: session.startFrame,
        currentFrame,
        center: getWorldCenter(project.canvas),
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
      }),
    );
    return true;
  };

  const releaseStagePointer = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const hadGesture = Boolean(gestureSessionRef.current);

    activePointersRef.current.delete(event.pointerId);
    if (tapCandidateRef.current?.pointerId === event.pointerId) {
      tapCandidateRef.current = null;
    }

    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Some browsers throw if capture was already released.
    }

    if (hadGesture && activePointersRef.current.size < 2) {
      gestureSessionRef.current = null;
      return true;
    }

    return hadGesture;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const screenPoint = getClientPoint(event, stageRef.current);

    if (!screenPoint) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointersRef.current.set(event.pointerId, {
      pointerId: event.pointerId,
      pointerType: event.pointerType || "mouse",
      point: screenPoint,
    });

    if (activePointersRef.current.size >= 2) {
      startStageGesture();
      return;
    }

    gestureSessionRef.current = null;
    tapCandidateRef.current = {
      pointerId: event.pointerId,
      start: screenPoint,
      moved: false,
    };

    if (tool === "pan") {
      setPanDrag({
        pointerId: event.pointerId,
        start: screenPoint,
        origin: viewRef.current.pan,
      });
      return;
    }

    const currentView = viewRef.current;
    const worldPoint = screenToWorld(screenPoint, currentView, project.canvas);

    if (tool === "image") {
      if (!referenceImage) {
        notify("Upload an image before framing it.", "warn");
        return;
      }
      setPatternDraft(null);
      setReplaceConfirmed(false);
      setImageDrag({
        pointerId: event.pointerId,
        startWorld: worldPoint,
        origin: {
          x: referenceImage.transform.translateX,
          y: referenceImage.transform.translateY,
        },
      });
      return;
    }

    if (tool === "eyedropper") {
      const image = resolvedActiveReferenceImageId
        ? referenceElementMapRef.current.get(resolvedActiveReferenceImageId)
        : null;
      if (!referenceImage || !image) {
        notify("Upload an image before choosing its background.", "warn");
        return;
      }
      const color = sampleReferenceColor(worldPoint, image, referenceImage, project.canvas);
      if (!color) {
        notify("Choose an opaque point inside the image.", "warn");
        return;
      }
      setPatternSettings((current) => ({ ...current, backgroundHex: color }));
      setPatternDraft(null);
      setTool("image");
      notify(`Background sample ${color} selected.`, "success");
      return;
    }

    if (tool === "erase") {
      const target = findNearestStitch(worldPoint, project, currentView);

      if (!target) {
        notify("No stitch selected.", "warn");
        return;
      }

      commitProject({
        ...project,
        stitches: project.stitches.filter((stitch) => stitch.id !== target.id),
      });
      notify("Stitch removed.", "success");
      return;
    }

    const startHole = nearestHole(worldPoint, project.canvas);

    if (!startHole) {
      notify("Start on a sheet hole.", "warn");
      return;
    }

    setDrag({ from: startHole, to: startHole });
    setHoverHole(startHole);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const screenPoint = getClientPoint(event, stageRef.current);

    if (!screenPoint) {
      return;
    }

    const activePointer = activePointersRef.current.get(event.pointerId);
    if (activePointer) {
      event.preventDefault();
      activePointersRef.current.set(event.pointerId, {
        ...activePointer,
        point: screenPoint,
      });

      if (
        tapCandidateRef.current?.pointerId === event.pointerId &&
        distanceBetween(tapCandidateRef.current.start, screenPoint) >
          TAP_MOVE_TOLERANCE
      ) {
        tapCandidateRef.current = {
          ...tapCandidateRef.current,
          moved: true,
        };
      }
    }

    if (
      gestureSessionRef.current ||
      activePointersRef.current.size >= 2
    ) {
      if (!gestureSessionRef.current) {
        startStageGesture();
      }
      updateStageGesture();
      return;
    }

    if (panDrag && panDrag.pointerId === event.pointerId) {
      updateView((current) => ({
        ...current,
        pan: {
          x: panDrag.origin.x + screenPoint.x - panDrag.start.x,
          y: panDrag.origin.y + screenPoint.y - panDrag.start.y,
        },
      }));
      return;
    }

    const currentView = viewRef.current;
    const worldPoint = screenToWorld(screenPoint, currentView, project.canvas);

    if (imageDrag && imageDrag.pointerId === event.pointerId && referenceImage) {
      const bounds = getPatternBounds(project.canvas);
      updateActiveReferenceImage((current) => ({
        ...current,
        transform: {
          ...current.transform,
          translateX:
            imageDrag.origin.x +
            (worldPoint.x - imageDrag.startWorld.x) / bounds.width,
          translateY:
            imageDrag.origin.y +
            (worldPoint.y - imageDrag.startWorld.y) / bounds.height,
        },
      }));
      return;
    }

    if (tool === "erase") {
      setHoverHole(nearestHole(worldPoint, project.canvas));
      setHoveredStitchId(
        findNearestStitch(worldPoint, project, currentView)?.id ?? null,
      );
      return;
    }

    const nextHole = nearestHole(worldPoint, project.canvas);
    setHoverHole(nextHole);

    if (drag) {
      setDrag({ ...drag, to: nextHole });
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const screenPoint = getClientPoint(event, stageRef.current);
    const wasTapCandidate =
      tapCandidateRef.current?.pointerId === event.pointerId &&
      !tapCandidateRef.current.moved;
    const handledGesture = releaseStagePointer(event);

    if (handledGesture) {
      event.preventDefault();
      return;
    }

    if (screenPoint) {
      event.preventDefault();
    }

    if (panDrag?.pointerId === event.pointerId) {
      setPanDrag(null);
      if (wasTapCandidate && screenPoint) {
        registerStageTap(screenPoint, event.timeStamp);
      }
      return;
    }

    if (imageDrag?.pointerId === event.pointerId) {
      setImageDrag(null);
      if (wasTapCandidate && screenPoint) {
        registerStageTap(screenPoint, event.timeStamp);
      }
      return;
    }

    if (!drag) {
      return;
    }

    const destination =
      screenPoint
        ? nearestHole(
            screenToWorld(screenPoint, viewRef.current, project.canvas),
            project.canvas,
          )
        : drag.to;

    setDrag(null);

    if (!destination || sameHole(drag.from, destination)) {
      if (wasTapCandidate && screenPoint) {
        registerStageTap(screenPoint, event.timeStamp);
        return;
      }
      notify("Choose a different destination hole.", "warn");
      return;
    }

    const capacity = canAddStitch(project, drag.from, destination, strandCount);

    if (!capacity.canAdd) {
      notify(
        `That hole cannot fit this stitch: ${capacity.blockedLoad}/${MAX_HOLE_STRAND_UNITS} strand capacity used.`,
        "warn",
      );
      return;
    }

    const ensured = ensureColorRole(project, activeColorId);
    commitProject({
      ...ensured.project,
      stitches: [
        ...project.stitches,
        makeStitch(drag.from, destination, ensured.roleId, strandCount),
      ],
    });
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    activePointersRef.current.delete(event.pointerId);
    if (activePointersRef.current.size < 2) {
      gestureSessionRef.current = null;
    }
    if (tapCandidateRef.current?.pointerId === event.pointerId) {
      tapCandidateRef.current = null;
    }
    setDrag(null);
    setPanDrag(null);
    setImageDrag(null);
  };

  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();

    if (tool === "image" && referenceImage) {
      const factor = event.deltaY > 0 ? 0.92 : 1.08;
      updateActiveReferenceImage((current) => ({
        ...current,
        transform: {
          ...current.transform,
          scale: clamp(
            current.transform.scale * factor,
            REFERENCE_MIN_SCALE,
            REFERENCE_MAX_SCALE,
          ),
        },
      }));
      return;
    }

    const screenPoint = getClientPoint(event, stageRef.current);

    if (!screenPoint) {
      return;
    }

    zoomAt(screenPoint, event.deltaY > 0 ? 0.9 : 1.1);
  }, [referenceImage, tool, updateActiveReferenceImage, zoomAt]);

  useEffect(() => {
    const stage = stageRef.current;

    if (!stage) {
      return;
    }

    stage.addEventListener("wheel", handleWheel, { passive: false });

    return () => stage.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const addDmcColor = (color: DmcColor) => {
    const paletteColor = paletteColorFromDmc(color);

    if (paletteIds.has(paletteColor.id)) {
      setSelectedColorId(paletteColor.id);
      notify(`DMC ${color.floss} selected.`, "info");
      return;
    }

    commitProject({
      ...project,
      palette: [...project.palette, paletteColor],
    });
    setSelectedColorId(paletteColor.id);
    notify(`DMC ${color.floss} added.`, "success");
  };

  const addCustomColor = () => {
    const trimmedName = customName.trim() || "Custom thread";
    const id = uniqueEntityId("thread");
    const nextProject = {
      ...project,
      palette: [
        ...project.palette,
        { id, name: trimmedName, hex: customHex, source: "custom" as const },
      ],
    };

    commitProject(nextProject);
    setSelectedColorId(id);
    notify("Thread color added.", "success");
  };

  const resetProject = () => {
    const nextProject = makeDefaultProject();

    closeColorwayStudio();
    clearReferenceImageCollection();
    commitProject(nextProject);
    setShowResetConfirm(false);
    setSelectedColorId(INITIAL_SELECTED_COLOR_ID);
    setStrandCount(DEFAULT_STRAND_COUNT);
    fitViewToCanvas(nextProject.canvas);
    notify("Sheet reset. Undo is available.", "info");
  };

  const openTemporaryProject = useCallback(
    (shared: DecodedShareProject, source: "url" | "file") => {
      if (!sharedProjectSource) {
        localWorkspaceRef.current = { project, rotation: viewRef.current.rotation };
      }
      const nextProject = normalizeProject(shared.project);
      clearReferenceImageCollection();
      setColorwayPreview(null);
      setInitialColorwayRoleId(undefined);
      setRightPanelMode("inspector");
      dispatch({ type: "hydrate", project: nextProject });
      setSharedProjectSource(source);
      updateView((current) => ({ ...current, rotation: shared.rotation }), true);
      hasFitViewRef.current = false;
      const firstUsedColor = getUsedResolvedColors(nextProject)[0]?.color.id;
      if (firstUsedColor) setSelectedColorId(firstUsedColor);
    },
    [clearReferenceImageCollection, project, sharedProjectSource, updateView],
  );

  const saveSharedProjectLocally = () => {
    try {
      window.localStorage.setItem(PROJECT_STORAGE_KEY, serializeProject(project));
      localWorkspaceRef.current = { project, rotation: viewRef.current.rotation };
      setSharedProjectSource(null);
      clearSharedProjectHash();
      notify("Shared project saved locally.", "success");
    } catch {
      notify("Local storage is not available.", "warn");
    }
  };

  const returnToLocalProject = useCallback(() => {
    const local = localWorkspaceRef.current ?? {
      project: makeDefaultProject(),
      rotation: 0,
    };
    dispatch({ type: "hydrate", project: local.project });
    setSharedProjectSource(null);
    clearReferenceImageCollection();
    setColorwayPreview(null);
    setInitialColorwayRoleId(undefined);
    setRightPanelMode("inspector");
    updateView((current) => ({ ...current, rotation: local.rotation }), true);
    hasFitViewRef.current = false;
    clearSharedProjectHash();
    const firstUsedColor = getUsedResolvedColors(local.project)[0]?.color.id;
    if (firstUsedColor) setSelectedColorId(firstUsedColor);
    notify("Returned to the locally saved project.", "info");
  }, [clearReferenceImageCollection, notify, updateView]);

  useEffect(() => {
    if (!state.hydrated) return;

    let active = true;
    const handleHashChange = async () => {
      const token = getShareTokenFromHash(window.location.hash);
      if (!token) {
        if (sharedProjectSource === "url") returnToLocalProject();
        return;
      }
      try {
        const shared = await decodeShareProject(token);
        if (!active) return;
        openTemporaryProject(shared, "url");
        notify("Shared project opened as a temporary copy.", "success");
      } catch (error) {
        if (!active) return;
        notify(
          error instanceof ShareProjectError
            ? error.message
            : "Could not open this shared project.",
          "warn",
        );
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      active = false;
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, [
    notify,
    openTemporaryProject,
    returnToLocalProject,
    sharedProjectSource,
    state.hydrated,
  ]);

  const exportPng = () => {
    setExporting(true);

    const canvas = createExportCanvas(project);

    if (!canvas) {
      setExporting(false);
      notify("Could not export this sheet.", "warn");
      return;
    }

    canvas.toBlob((blob) => {
      setExporting(false);

      if (!blob) {
        notify("Could not export this sheet.", "warn");
        return;
      }

      downloadBlob(blob, `needler-design-${formatTimestamp()}.png`);
      notify("PNG exported.", "success");
    }, "image/png");
  };

  const zoomAroundCenter = (factor: number) => {
    zoomAt({ x: viewport.x / 2, y: viewport.y / 2 }, factor);
  };

  const rotateViewBy = (degrees: number) => {
    updateView((current) => ({
      ...current,
      rotation: normalizeViewRotation(current.rotation + degrees),
    }));
  };

  const changeViewRotation = (degrees: number) => {
    updateView((current) => ({
      ...current,
      rotation: normalizeViewRotation(degrees),
    }));
  };

  const handleReferenceUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";

    if (files.length === 0) {
      return;
    }

    const imageFiles = files.filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length === 0) {
      notify("Choose an image file.", "warn");
      return;
    }

    if (imageFiles.length < files.length) {
      notify("Only image files were added.", "warn");
    }

    const loadedImages = (
      await Promise.allSettled(
        imageFiles.map(
          (file) =>
            new Promise<ReferenceImageState>((resolve, reject) => {
              const reader = new FileReader();

              reader.onload = () => {
                if (typeof reader.result !== "string") {
                  reject(new Error("Invalid image data"));
                  return;
                }

                resolve(
                  makeReferenceImageState({
                    id: uniqueEntityId("image"),
                    src: reader.result,
                    name: file.name,
                  }),
                );
              };
              reader.onerror = () => reject(new Error("Could not read image"));
              reader.readAsDataURL(file);
            }),
        ),
      )
    ).flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));

    if (loadedImages.length === 0) {
      notify("Could not read those reference images.", "warn");
      return;
    }

    const newest = loadedImages[loadedImages.length - 1];
    setReferenceImages((current) => [...current, ...loadedImages]);
    setActiveReferenceImageId(newest.id);
    clearPatternPreviewState();
    setPreviewMode("both");
    setTool("image");
    notify(
      loadedImages.length === 1
        ? "Reference image added."
        : `${loadedImages.length} reference images added.`,
      "success",
    );
  };

  const removeReferenceImage = (id: string) => {
    const target = referenceImages.find((image) => image.id === id);

    if (!target) {
      return;
    }

    const isRemovingActive = id === resolvedActiveReferenceImageId;
    const nextActiveId = isRemovingActive
      ? nextActiveReferenceImageIdAfterRemoval(referenceImages, id)
      : resolvedActiveReferenceImageId;

    referenceElementMapRef.current.delete(id);
    setReferenceImages((current) => current.filter((image) => image.id !== id));
    setActiveReferenceImageId(nextActiveId);
    if (isRemovingActive) {
      clearPatternPreviewState();
    }
    if (!nextActiveId && (tool === "image" || tool === "eyedropper")) {
      setTool("stitch");
    }
    notify("Reference image removed.", "info");
  };

  const clearReferenceImage = () => {
    if (referenceImage) {
      removeReferenceImage(referenceImage.id);
    }
  };

  const resetReferenceFrame = (fit: "fit" | "fill") => {
    updateActiveReferenceImage((current) => ({
      ...current,
      fit,
      transform: {
        ...current.transform,
        scale: 1,
        translateX: 0,
        translateY: 0,
      },
    }));
  };

  const rotateReference = () => {
    updateActiveReferenceImage((current) => ({
      ...current,
      transform: {
        ...current.transform,
        rotation: ((current.transform.rotation + 90) %
          360) as ReferenceTransform["rotation"],
      },
    }));
  };

  const cancelPatternPreview = () => {
    patternWorkerRef.current?.terminate();
    patternWorkerRef.current = null;
    setPatternJob({ status: "idle" });
    notify("Pattern conversion canceled.", "info");
  };

  const generatePatternPreview = () => {
    const image = resolvedActiveReferenceImageId
      ? referenceElementMapRef.current.get(resolvedActiveReferenceImageId)
      : null;
    if (!referenceImage || !image) {
      notify("Upload and load an image first.", "warn");
      return;
    }

    const sampleCanvas = createPatternSampleCanvas(image, referenceImage, project.canvas);
    const ctx = sampleCanvas?.getContext("2d", { willReadFrequently: true });
    if (!sampleCanvas || !ctx) {
      notify("Could not sample that image.", "warn");
      return;
    }

    patternWorkerRef.current?.terminate();
    const worker = new Worker(new URL("../_workers/pattern.worker.ts", import.meta.url), {
      type: "module",
    });
    patternWorkerRef.current = worker;
    const settings = { ...patternSettings, strands: strandCount };
    setPatternJob({
      status: "working",
      progress: { stage: "sampling", percent: 2 },
    });
    setReplaceConfirmed(false);
    const imageData = ctx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);

    worker.onmessage = (
      event: MessageEvent<
        | { type: "progress"; progress: PatternProgress }
        | { type: "result"; draft: PatternDraft }
        | { type: "error"; message: string }
      >,
    ) => {
      if (event.data.type === "progress") {
        setPatternJob({ status: "working", progress: event.data.progress });
        return;
      }

      worker.terminate();
      if (patternWorkerRef.current === worker) patternWorkerRef.current = null;

      if (event.data.type === "error") {
        setPatternJob({ status: "error", message: event.data.message });
        notify(event.data.message, "warn");
        return;
      }

      const draft = {
        ...event.data.draft,
        cells:
          event.data.draft.cells instanceof Uint16Array
            ? event.data.draft.cells
            : new Uint16Array(event.data.draft.cells),
      };
      setPatternDraft(draft);
      setPatternJob({ status: "idle" });
      setPreviewMode("both");
      notify(
        draft.stats.stitchedCells > 0
          ? `${draft.stats.stitchedCells.toLocaleString()} stitches matched to ${draft.colors.length} thread colors.`
          : "No stitchable image cells remain after background removal.",
        draft.stats.stitchedCells > 0 ? "success" : "warn",
      );
    };

    worker.onerror = () => {
      worker.terminate();
      if (patternWorkerRef.current === worker) patternWorkerRef.current = null;
      setPatternJob({ status: "error", message: "Pattern conversion failed." });
      notify("Pattern conversion failed.", "warn");
    };

    const rgba = imageData.data.buffer as ArrayBuffer;
    worker.postMessage(
      {
        type: "convert",
        rgba,
        width: imageData.width,
        height: imageData.height,
        cols: project.canvas.cols - 1,
        rows: project.canvas.rows - 1,
        existingPalette: project.palette,
        settings,
      },
      [rgba],
    );
  };

  const commitPatternDraft = (mode: "replace" | "fill") => {
    if (!patternDraft || patternDraft.stats.stitchedCells === 0) return;
    const result = applyPatternDraft(project, patternDraft, mode);
    commitProject(result.project);
    setPatternDraft(null);
    setReplaceConfirmed(false);
    setPreviewMode("pattern");
    notify(
      `${result.additions.toLocaleString()} stitches applied, ${result.colorsAdded} DMC colors added${
        result.occupiedSkipped || result.capacitySkipped
          ? `; ${result.occupiedSkipped} occupied and ${result.capacitySkipped} capacity conflicts skipped`
          : ""
      }.`,
      result.capacitySkipped ? "warn" : "success",
    );
  };

  const replaceWithPattern = () => {
    if (project.stitches.length > 0 && !replaceConfirmed) {
      setReplaceConfirmed(true);
      return;
    }
    commitPatternDraft("replace");
  };

  const cancelPdfExport = () => {
    pdfExportIdRef.current += 1;
    pdfWorkerRef.current?.terminate();
    pdfWorkerRef.current = null;
    setPdfJob({ status: "idle" });
    notify("PDF export canceled.", "info");
  };

  const exportPatternPdf = async () => {
    if (project.stitches.length === 0) {
      notify("Add stitches before exporting a pattern.", "warn");
      return;
    }

    setPdfJob({
      status: "working",
      progress: { stage: "preparing", percent: 2 },
    });
    const exportId = pdfExportIdRef.current + 1;
    pdfExportIdRef.current = exportId;
    const previewPng = await createPdfPreviewPng(project);
    if (pdfExportIdRef.current !== exportId) {
      return;
    }
    const worker = new Worker(new URL("../_workers/patternPdf.worker.ts", import.meta.url), {
      type: "module",
    });
    pdfWorkerRef.current = worker;

    worker.onmessage = (
      event: MessageEvent<
        | { type: "progress"; progress: PatternPdfProgress }
        | { type: "result"; buffer: ArrayBuffer }
        | { type: "error"; message: string }
      >,
    ) => {
      if (pdfExportIdRef.current !== exportId) {
        worker.terminate();
        return;
      }

      if (event.data.type === "progress") {
        setPdfJob({ status: "working", progress: event.data.progress });
        return;
      }
      worker.terminate();
      if (pdfWorkerRef.current === worker) pdfWorkerRef.current = null;
      if (event.data.type === "error") {
        setPdfJob({ status: "error", message: event.data.message });
        notify(event.data.message, "warn");
        return;
      }
      downloadBlob(
        new Blob([event.data.buffer], { type: "application/pdf" }),
        `needler-pattern-${formatTimestamp()}.pdf`,
      );
      setPdfJob({ status: "idle" });
      notify("Printable pattern exported.", "success");
    };

    worker.onerror = () => {
      if (pdfExportIdRef.current !== exportId) {
        worker.terminate();
        return;
      }

      worker.terminate();
      if (pdfWorkerRef.current === worker) pdfWorkerRef.current = null;
      setPdfJob({ status: "error", message: "PDF export failed." });
      notify("PDF export failed.", "warn");
    };

    const payload = {
      type: "generate" as const,
      project,
      paperSize,
      previewPng: previewPng ?? undefined,
    };
    worker.postMessage(payload, previewPng ? [previewPng] : []);
  };

  const updatePatternSettings = (updates: Partial<PatternSettings>) => {
    setPatternSettings((current) => ({ ...current, ...updates }));
    setPatternDraft(null);
    setReplaceConfirmed(false);
  };

  const activeToolLabel = getToolLabel(tool);
  const activePanelLabel = getPanelLabel(rightPanelMode);
  const workspaceGridClass = [
    "mx-auto grid min-h-[100dvh] w-full max-w-[1800px] grid-cols-1 gap-3 px-2 py-2 md:px-3 md:py-3 xl:px-4 xl:py-4",
    toolRailCollapsed && panelCollapsed
      ? "xl:grid-cols-[48px_minmax(0,1fr)_48px]"
      : toolRailCollapsed
        ? "xl:grid-cols-[48px_minmax(0,1fr)_330px]"
        : panelCollapsed
          ? "xl:grid-cols-[72px_minmax(0,1fr)_48px]"
          : "xl:grid-cols-[72px_minmax(0,1fr)_330px]",
  ].join(" ");
  const toolRailClass = [
    "order-2 flex items-center gap-2 overflow-x-auto rounded-lg border border-[#d6bfa6] bg-[#ead9c4]/78 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.52)] xl:order-1 xl:flex-col xl:overflow-visible",
    toolRailCollapsed ? "justify-between xl:w-12 xl:px-1" : "",
  ].join(" ");
  const stagePanelClass =
    "order-1 flex min-h-[clamp(600px,78dvh,960px)] min-w-0 flex-col rounded-lg border border-[#cfb69c] bg-[#f8f0e5] shadow-[0_20px_44px_-28px_rgba(87,55,35,0.36)] md:min-h-[clamp(680px,80dvh,1040px)] xl:order-2 xl:min-h-[calc(100dvh-2rem)]";

  return (
    <main className="min-h-[100dvh] bg-[#f3ebdf] text-[#38271d]">
      <div className={workspaceGridClass}>
        <aside className={toolRailClass}>
          <IconButton
            label={toolRailCollapsed ? "Show tools" : "Collapse tools"}
            onClick={() => setToolRailCollapsed((current) => !current)}
          >
            {toolRailCollapsed ? (
              <PanelLeftOpen size={18} strokeWidth={1.8} />
            ) : (
              <PanelLeftClose size={18} strokeWidth={1.8} />
            )}
          </IconButton>
          {toolRailCollapsed ? (
            <button
              type="button"
              aria-label={`Active tool: ${activeToolLabel}`}
              title={`Active tool: ${activeToolLabel}`}
              className="flex h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-[#7e4e36] bg-[#7e4e36] px-2 text-sm font-medium text-[#fff9f0] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
              onClick={() => setToolRailCollapsed(false)}
            >
              <ToolGlyph tool={tool} size={18} strokeWidth={1.8} />
              <span className="md:inline xl:hidden">{activeToolLabel}</span>
            </button>
          ) : (
            <>
          <IconButton
            label="Stitch tool"
            active={tool === "stitch"}
            onClick={() => setTool("stitch")}
          >
            <NeedleIcon size={18} strokeWidth={1.8} />
          </IconButton>
          <IconButton
            label="Erase tool"
            active={tool === "erase"}
            onClick={() => setTool("erase")}
          >
            <Eraser size={18} strokeWidth={1.8} />
          </IconButton>
          <IconButton
            label="Pan tool"
            active={tool === "pan"}
            onClick={() => setTool("pan")}
          >
            <Move size={18} strokeWidth={1.8} />
          </IconButton>
          <IconButton
            label="Frame reference image"
            active={tool === "image"}
            disabled={!referenceImage}
            onClick={() => setTool("image")}
          >
            <Crop size={18} strokeWidth={1.8} />
          </IconButton>
          <IconButton
            label="Pick background color"
            active={tool === "eyedropper"}
            disabled={!referenceImage}
            onClick={() => setTool("eyedropper")}
          >
            <Pipette size={18} strokeWidth={1.8} />
          </IconButton>
          <div className="hidden h-px w-9 bg-[#c7aa8e] lg:block" />
          <IconButton
            label="Undo"
            disabled={state.past.length === 0}
            onClick={() => {
              closeColorwayStudio();
              dispatch({ type: "undo" });
            }}
          >
            <Undo2 size={18} strokeWidth={1.8} />
          </IconButton>
          <IconButton
            label="Redo"
            disabled={state.future.length === 0}
            onClick={() => {
              closeColorwayStudio();
              dispatch({ type: "redo" });
            }}
          >
            <Redo2 size={18} strokeWidth={1.8} />
          </IconButton>
          <div className="hidden h-px w-9 bg-[#c7aa8e] lg:block" />
          <IconButton label="Zoom in" onClick={() => zoomAroundCenter(1.12)}>
            <Plus size={18} strokeWidth={1.8} />
          </IconButton>
          <IconButton label="Zoom out" onClick={() => zoomAroundCenter(0.88)}>
            <Minus size={18} strokeWidth={1.8} />
          </IconButton>
          <IconButton label="Fit sheet" onClick={fitView}>
            <Maximize2 size={18} strokeWidth={1.8} />
          </IconButton>
          <IconButton label="Rotate sheet 90 degrees" onClick={() => rotateViewBy(90)}>
            <RotateCw size={18} strokeWidth={1.8} />
          </IconButton>
          <div className="hidden h-px w-9 bg-[#c7aa8e] lg:block" />
          <IconButton
            label="Share project"
            active={rightPanelMode === "share"}
            onClick={openSharePanel}
          >
            <Share2 size={18} strokeWidth={1.8} />
          </IconButton>
          <IconButton label="Export PNG" disabled={exporting} onClick={exportPng}>
            {exporting ? (
              <LoaderCircle size={18} strokeWidth={1.8} className="animate-spin" />
            ) : (
              <Download size={18} strokeWidth={1.8} />
            )}
          </IconButton>
          <IconButton
            label="Export printable pattern PDF"
            disabled={isPdfExporting || project.stitches.length === 0}
            onClick={exportPatternPdf}
          >
            {isPdfExporting ? (
              <LoaderCircle size={18} strokeWidth={1.8} className="animate-spin" />
            ) : (
              <FileText size={18} strokeWidth={1.8} />
            )}
          </IconButton>
          <IconButton label="Reset sheet" onClick={() => setShowResetConfirm(true)}>
            <Trash2 size={18} strokeWidth={1.8} />
          </IconButton>
            </>
          )}
        </aside>

        <section className={stagePanelClass}>
          {sharedProjectSource ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dec9b1] bg-[#f4e4d1] px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-[#4f392b]">
                <Share2 size={15} strokeWidth={1.8} className="shrink-0" />
                <span className="truncate">
                  {sharedProjectSource === "url" ? "Shared link" : "Opened file"}
                </span>
                <span className="rounded bg-[#e1c9af] px-1.5 py-0.5 font-mono text-[9px] uppercase text-[#765943]">
                  Temporary
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#7e4e36] bg-[#7e4e36] px-2.5 text-xs font-medium text-white hover:bg-[#6f422d]"
                  onClick={saveSharedProjectLocally}
                >
                  <Save size={14} strokeWidth={1.8} />
                  Save locally
                </button>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#c9ad91] bg-[#fff8ef] px-2.5 text-xs font-medium text-[#5e4432] hover:bg-white"
                  onClick={returnToLocalProject}
                >
                  <RotateCcw size={14} strokeWidth={1.8} />
                  Return
                </button>
              </div>
            </div>
          ) : null}

          <div
            ref={stageRef}
            className={[
              "relative min-h-[clamp(520px,72dvh,880px)] flex-1 select-none overflow-hidden overscroll-contain bg-[#d6bd9f] touch-none xl:min-h-0",
              tool === "image"
                ? imageDrag
                  ? "cursor-grabbing"
                  : "cursor-grab"
                : tool === "pan"
                  ? panDrag
                    ? "cursor-grabbing"
                    : "cursor-grab"
                  : tool === "eyedropper"
                    ? "cursor-crosshair"
                    : tool === "erase"
                      ? "cursor-eraser"
                      : "cursor-needle",
            ].join(" ")}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.34),transparent_28%),linear-gradient(135deg,#dec4a4,#c59d75)]" />
            <canvas ref={baseCanvasRef} className="absolute inset-0" />
            <canvas ref={stitchCanvasRef} className="absolute inset-0" />
            <canvas ref={previewCanvasRef} className="absolute inset-0" />
            <div
              className="pointer-events-auto absolute w-[min(224px,calc(100%-1.5rem))]"
              style={{
                right: "max(0.75rem, env(safe-area-inset-right))",
                top: "max(4.9rem, calc(env(safe-area-inset-top) + 4.9rem))",
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerMove={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
              onPointerCancel={(event) => event.stopPropagation()}
              onWheel={(event) => event.stopPropagation()}
            >
              {quickColorCollapsed ? (
                <button
                  type="button"
                  aria-label="Show thread colors"
                  title="Show thread colors"
                  className="ml-auto flex h-11 w-11 items-center justify-center rounded-md border border-[#d8c4ad] bg-[#fff8ef]/92 p-1.5 shadow-[0_12px_30px_-24px_rgba(58,35,22,0.5)] transition active:translate-y-px"
                  onClick={() => setQuickColorCollapsed(false)}
                >
                  <span
                    className="h-full w-full rounded border border-[#cdb39a]"
                    style={{ backgroundColor: activePreviewColor }}
                  />
                </button>
              ) : (
                <div className="rounded-md border border-[#d6bfa6] bg-[#fff8ef]/94 p-2 shadow-[0_18px_36px_-26px_rgba(58,35,22,0.55)]">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="flex min-w-0 items-center gap-2 text-left"
                      onClick={() => {
                        setPanelCollapsed(false);
                        setRightPanelMode("inspector");
                      }}
                    >
                      <span
                        className="h-8 w-8 shrink-0 rounded border border-[#cdb39a]"
                        style={{ backgroundColor: activePreviewColor }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold uppercase tracking-[0.08em] text-[#765943]">
                          Thread
                        </span>
                        <span className="block truncate text-xs text-[#4f392b]">
                          {selectedColor ? getPaletteLabel(selectedColor) : "Select color"}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label="Collapse thread colors"
                      title="Collapse thread colors"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#d8c4ad] bg-white text-[#654a38] transition active:translate-y-px"
                      onClick={() => setQuickColorCollapsed(true)}
                    >
                      <PanelRightClose size={15} strokeWidth={1.8} />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-7 gap-1">
                    {quickColorOptions.map((color) => (
                      <button
                        key={color.id}
                        type="button"
                        aria-label={`Select ${getPaletteLabel(color)}`}
                        title={getPaletteLabel(color)}
                        className={[
                          "h-6 rounded border transition active:translate-y-px",
                          selectedColorId === color.id
                            ? "border-[#38271d] ring-2 ring-[#7e4e36]/25"
                            : "border-[#d6bfa6] hover:border-[#9d8064]",
                        ].join(" ")}
                        style={{ backgroundColor: color.hex }}
                        onClick={() => setSelectedColorId(color.id)}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-[#d8c4ad] bg-white px-2 text-xs font-medium text-[#4f392b] transition hover:border-[#b99b7d] active:translate-y-px"
                    onClick={() => {
                      setPanelCollapsed(false);
                      setRightPanelMode("inspector");
                    }}
                  >
                    <Palette size={14} strokeWidth={1.8} />
                    Manage colors
                  </button>
                </div>
              )}
            </div>
            {patternJob.status === "working" ? (
              <div
                className="pointer-events-none absolute left-1/2 w-[min(320px,calc(100%-24px))] -translate-x-1/2 rounded-md border border-[#d6bfa6] bg-[#fff8ef]/94 px-3 py-3 shadow-[0_14px_28px_-22px_rgba(58,35,22,0.5)]"
                style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
              >
                <div className="flex items-center justify-between gap-3 text-xs font-medium uppercase tracking-[0.08em] text-[#765943]">
                  <span>{patternJob.progress.stage}</span>
                  <span className="font-mono">{patternJob.progress.percent}%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e2d0bd]">
                  <div
                    className="h-full rounded-full bg-[#7e4e36] transition-transform duration-300 origin-left"
                    style={{ transform: `scaleX(${patternJob.progress.percent / 100})` }}
                  />
                </div>
              </div>
            ) : null}
            {project.stitches.length === 0 ? (
              <div
                className="pointer-events-none absolute max-w-[230px] rounded-md border border-[#e2cbb2] bg-[#fff8ef]/88 px-3 py-2 text-sm text-[#765943] shadow-[0_12px_30px_-24px_rgba(58,35,22,0.42)]"
                style={{
                  left: "max(0.75rem, env(safe-area-inset-left))",
                  top: "max(0.75rem, env(safe-area-inset-top))",
                }}
              >
                No stitches yet
              </div>
            ) : null}
            {notice ? (
              <div
                className={[
                  "pointer-events-none absolute w-[min(280px,calc(100%-24px))] rounded-md border px-3 py-2 text-sm font-medium shadow-[0_12px_30px_-22px_rgba(58,35,22,0.48)]",
                  notice.tone === "warn"
                    ? "border-[#cfa098] bg-[#fff3ef] text-[#8a332c]"
                    : notice.tone === "success"
                      ? "border-[#b8c59e] bg-[#f4f8ed] text-[#536842]"
                      : "border-[#e2cbb2] bg-[#fff8ef] text-[#765943]",
                ].join(" ")}
                style={{
                  bottom: "max(0.75rem, env(safe-area-inset-bottom))",
                  left: "max(0.75rem, env(safe-area-inset-left))",
                }}
              >
                {notice.message}
              </div>
            ) : null}
            <div
              className="pointer-events-none absolute grid gap-1 rounded-md border border-[#e2cbb2] bg-[#fff8ef]/88 px-3 py-2 text-right font-mono text-xs text-[#765943]"
              style={{
                right: "max(0.75rem, env(safe-area-inset-right))",
                top: "max(0.75rem, env(safe-area-inset-top))",
              }}
            >
              <span>{Math.round(view.zoom * 100)}%</span>
              <span>{Math.round(view.rotation)} deg</span>
            </div>
            <div
              className="pointer-events-none absolute flex items-center gap-2 rounded-md border border-[#e2cbb2] bg-[#fff8ef]/88 px-3 py-2 text-xs font-medium uppercase tracking-[0.08em] text-[#765943] shadow-[0_12px_30px_-24px_rgba(58,35,22,0.42)]"
              style={{
                bottom: "max(0.75rem, env(safe-area-inset-bottom))",
                right: "max(0.75rem, env(safe-area-inset-right))",
              }}
            >
              <span className="h-2 w-2 rounded-full bg-[#6f8d62]" />
              {editorStatusLabel}
            </div>
          </div>
        </section>

        {rightPanelMode === "colorways" ? (
          <ColorwayStudio
            project={project}
            initialRoleId={initialColorwayRoleId}
            onPreview={handleColorwayPreview}
            onCommit={commitColorwayProject}
            onClose={closeColorwayStudio}
            onCollapse={() => setPanelCollapsed(true)}
            onExpand={() => setPanelCollapsed(false)}
            collapsed={panelCollapsed}
          />
        ) : rightPanelMode === "share" ? (
          <ShareProjectPanel
            project={project}
            rotation={view.rotation}
            onOpenProject={openTemporaryProject}
            onNotify={notify}
            onClose={() => setRightPanelMode("inspector")}
            onCollapse={() => setPanelCollapsed(true)}
            onExpand={() => setPanelCollapsed(false)}
            collapsed={panelCollapsed}
          />
        ) : panelCollapsed ? (
          <aside className="order-3 flex items-center justify-between gap-2 rounded-lg border border-[#d6bfa6] bg-[#fff8ef] p-2 shadow-[0_20px_44px_-30px_rgba(87,55,35,0.32)] xl:min-h-[calc(100dvh-2rem)] xl:flex-col xl:justify-start xl:px-1">
            <button
              type="button"
              aria-label={`Show ${activePanelLabel} panel`}
              title={`Show ${activePanelLabel} panel`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[#7e4e36] bg-[#7e4e36] text-[#fff9f0] transition active:translate-y-px"
              onClick={() => setPanelCollapsed(false)}
            >
              <PanelRightOpen size={18} strokeWidth={1.8} />
            </button>
            <span className="max-w-[180px] truncate text-xs font-semibold uppercase tracking-[0.1em] text-[#765943] xl:max-w-none xl:rotate-180 xl:[writing-mode:vertical-rl]">
              {activePanelLabel}
            </span>
          </aside>
        ) : (
        <aside className="order-3 flex flex-col gap-4 rounded-lg border border-[#d6bfa6] bg-[#fff8ef] p-4 shadow-[0_20px_44px_-30px_rgba(87,55,35,0.32)] xl:max-h-[calc(100dvh-2rem)] xl:overflow-auto">
          <div className="flex items-center justify-between gap-3 border-b border-[#e4d2bf] pb-3">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#765943]">
              Inspector
            </span>
            <button
              type="button"
              aria-label="Collapse inspector"
              title="Collapse panel"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-[#d8c4ad] bg-white text-[#654a38] transition hover:border-[#aa896c] active:translate-y-px"
              onClick={() => setPanelCollapsed(true)}
            >
              <PanelRightClose size={17} strokeWidth={1.8} />
            </button>
          </div>
          <section>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#765943]">
                  Thread
                </h2>
                <p className="mt-1 text-sm text-[#4f392b]">
                  {selectedColor ? getPaletteLabel(selectedColor) : "Select a color"}
                </p>
                {selectedColor ? (
                  <p className="mt-1 font-mono text-xs uppercase text-[#8a6c55]">
                    {selectedColor.hex}
                  </p>
                ) : null}
              </div>
              <div
                className="h-10 w-10 rounded-md border border-[#cdb39a] shadow-[inset_0_1px_0_rgba(255,255,255,0.38)]"
                style={{ backgroundColor: activePreviewColor }}
              />
            </div>

            <div className="mt-4 grid grid-cols-7 gap-2">
              {threadSwatchColors.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  aria-label={`Select ${getPaletteLabel(color)}`}
                  title={getPaletteLabel(color)}
                  className={[
                    "h-9 rounded-md border transition active:translate-y-px",
                    selectedColorId === color.id
                      ? "border-[#4f392b] ring-2 ring-[#7e4e36]/25"
                      : "border-[#d6bfa6] hover:border-[#9d8064]",
                  ].join(" ")}
                  style={{ backgroundColor: color.hex }}
                  onClick={() => setSelectedColorId(color.id)}
                />
              ))}
            </div>

            <button
              type="button"
              className={`${panelButtonClass("solid")} mt-3 w-full`}
              disabled={project.stitches.length === 0 || Boolean(patternDraft)}
              onClick={() => openColorwayStudio()}
            >
              <Palette size={16} strokeWidth={1.8} />
              Edit colorways
              <span className="ml-auto max-w-24 truncate font-mono text-[10px] uppercase opacity-75">
                {activeColorwayName}
              </span>
            </button>

            {usedColorRoles.length > 0 ? (
              <div className="mt-3 divide-y divide-[#ead9c7] border-y border-[#ead9c7]">
                {usedColorRoles.map((usage) => (
                  <div
                    key={usage.role.id}
                    className="grid grid-cols-[minmax(0,1fr)_38px] items-stretch bg-white/55"
                  >
                    <button
                      type="button"
                      className="grid min-w-0 grid-cols-[24px_minmax(0,1fr)] items-center gap-2 px-2 py-2 text-left"
                      onClick={() => setSelectedColorId(usage.current.id)}
                    >
                      <span
                        className="h-6 w-6 rounded border border-[#cdb39a]"
                        style={{ backgroundColor: usage.original.hex }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-[#3d2b1f]">
                          {usage.original.floss
                            ? `DMC ${usage.original.floss}`
                            : usage.original.name}
                        </span>
                        <span className="block truncate font-mono text-[10px] text-[#8a6c55]">
                          {usage.current.id === usage.original.id
                            ? `${usage.count.toLocaleString()} stitches`
                            : `${usage.count.toLocaleString()} to ${
                                usage.current.floss
                                  ? `DMC ${usage.current.floss}`
                                  : usage.current.name
                              }`}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Replace ${getPaletteLabel(usage.original)} throughout`}
                      title="Replace throughout"
                      className="flex items-center justify-center border-l border-[#ead9c7] text-[#765943] transition hover:bg-[#fff2df] hover:text-[#4f392b]"
                      onClick={() => openColorwayStudio(usage.role.id)}
                    >
                      <Palette size={15} strokeWidth={1.8} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="border-t border-[#e4d2bf] pt-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#765943]">
              DMC library
            </h2>
            <label className="mt-3 grid gap-2 text-sm font-medium text-[#4f392b]">
              Find floss
              <input
                type="search"
                value={dmcQuery}
                placeholder="3848, teal, old gold"
                className="h-10 rounded-md border border-[#d8c4ad] bg-white px-3 text-sm outline-none transition placeholder:text-[#a58d74] focus:border-[#7e4e36]"
                onChange={(event) => setDmcQuery(event.target.value)}
              />
            </label>
            <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto pr-1">
              {filteredDmcColors.map((color) => {
                const paletteId = dmcColorId(color.floss);
                const isInPalette = paletteIds.has(paletteId);

                return (
                  <button
                    key={color.floss}
                    type="button"
                    className={[
                      "grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-2 py-2 text-left transition active:translate-y-px",
                      selectedColorId === paletteId
                        ? "border-[#4f392b] bg-[#fff3e2]"
                        : "border-[#e0ccb6] bg-white hover:border-[#b99b7d]",
                    ].join(" ")}
                    onClick={() => addDmcColor(color)}
                  >
                    <span
                      className="h-7 w-7 rounded border border-[#d0b69c]"
                      style={{ backgroundColor: color.hex }}
                    />
                    <span className="min-w-0">
                      <span className="block font-mono text-xs text-[#765943]">
                        DMC {color.floss}
                      </span>
                      <span className="block truncate text-sm font-medium text-[#3d2b1f]">
                        {color.name}
                      </span>
                    </span>
                    <span className="text-xs font-medium uppercase tracking-[0.08em] text-[#8a6c55]">
                      {isInPalette ? "Use" : "Add"}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 font-mono text-xs text-[#8a6c55]">
              {DMC_COLORS.length} DMC colors
            </p>
          </section>

          <section className="border-t border-[#e4d2bf] pt-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#765943]">
                Image to pattern
              </h2>
              <span className="font-mono text-[10px] uppercase text-[#8a6c55]">Local</span>
            </div>
            <div className="mt-3 grid gap-3">
              <label className={`${panelButtonClass()} cursor-pointer`}>
                <ImagePlus size={16} strokeWidth={1.8} />
                {referenceImages.length > 0 ? "Add images" : "Upload images"}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={handleReferenceUpload}
                />
              </label>
              {referenceImages.length > 0 ? (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-[0.08em] text-[#765943]">
                      Reference images
                    </span>
                    <span className="font-mono text-[10px] uppercase text-[#8a6c55]">
                      {referenceImages.length} local
                    </span>
                  </div>
                  <div className="grid max-h-36 gap-1 overflow-y-auto pr-1">
                    {referenceImages.map((imageState) => {
                      const isActive = imageState.id === resolvedActiveReferenceImageId;

                      return (
                        <div
                          key={imageState.id}
                          className={[
                            "grid grid-cols-[minmax(0,1fr)_32px] items-stretch overflow-hidden rounded-md border bg-white/70",
                            isActive ? "border-[#7e4e36]" : "border-[#e4d2bf]",
                          ].join(" ")}
                        >
                          <button
                            type="button"
                            className="min-w-0 px-2 py-1.5 text-left transition hover:bg-white"
                            onClick={() => selectReferenceImage(imageState.id)}
                          >
                            <span className="block truncate text-xs font-medium text-[#3d2b1f]">
                              {imageState.name}
                            </span>
                            <span className="block font-mono text-[10px] text-[#8a6c55]">
                              {imageState.width && imageState.height
                                ? `${imageState.width} x ${imageState.height}`
                                : "Loading"}
                            </span>
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove ${imageState.name}`}
                            title="Remove image"
                            className="flex items-center justify-center border-l border-[#ead9c7] text-[#765943] transition hover:bg-[#fff2df] hover:text-[#8a332c]"
                            onClick={() => removeReferenceImage(imageState.id)}
                          >
                            <X size={14} strokeWidth={1.8} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {referenceImage ? (
                <>
                  <div className="rounded-md border border-[#e4d2bf] bg-white/70 px-3 py-2">
                    <p className="truncate text-sm font-medium text-[#3d2b1f]">
                      {referenceImage.name}
                    </p>
                    <p className="mt-1 font-mono text-xs text-[#8a6c55]">
                      {referenceImage.width && referenceImage.height
                        ? `${referenceImage.width} x ${referenceImage.height} px`
                        : "Loading image"}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className={panelButtonClass(tool === "image" ? "solid" : "quiet")}
                      onClick={() => setTool("image")}
                    >
                      <Crop size={16} strokeWidth={1.8} />
                      Drag image
                    </button>
                    <button
                      type="button"
                      className={panelButtonClass()}
                      onClick={rotateReference}
                    >
                      <RotateCw size={16} strokeWidth={1.8} />
                      Rotate 90
                    </button>
                    <button
                      type="button"
                      className={panelButtonClass(referenceImage.fit === "fit" ? "solid" : "quiet")}
                      onClick={() => resetReferenceFrame("fit")}
                    >
                      Fit
                    </button>
                    <button
                      type="button"
                      className={panelButtonClass(referenceImage.fit === "fill" ? "solid" : "quiet")}
                      onClick={() => resetReferenceFrame("fill")}
                    >
                      Fill
                    </button>
                  </div>
                  <label className="flex flex-col gap-2 text-sm font-medium text-[#4f392b]">
                    Image scale
                    <input
                      type="range"
                      min="0.25"
                      max="4"
                      step="0.01"
                      value={referenceImage.transform.scale}
                      className="accent-[#7e4e36]"
                      onChange={(event) =>
                        updateActiveReferenceImage((current) => ({
                          ...current,
                          transform: {
                            ...current.transform,
                            scale: Number(event.target.value),
                          },
                        }))
                      }
                    />
                    <span className="font-mono text-xs font-normal text-[#8a6c55]">
                      {Math.round(referenceImage.transform.scale * 100)}%
                    </span>
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium text-[#4f392b]">
                    Overlay opacity
                    <input
                      type="range"
                      min="0.1"
                      max="0.85"
                      step="0.05"
                      value={referenceImage.opacity}
                      className="accent-[#7e4e36]"
                      onChange={(event) =>
                        updateActiveReferenceImage((current) => ({
                          ...current,
                          opacity: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className={panelButtonClass()}
                      onClick={clearReferenceImage}
                    >
                      <ImageOff size={16} strokeWidth={1.8} />
                      Remove
                    </button>
                    <button
                      type="button"
                      className={panelButtonClass(tool === "eyedropper" ? "solid" : "quiet")}
                      onClick={() => setTool("eyedropper")}
                    >
                      <Pipette size={16} strokeWidth={1.8} />
                      Background
                    </button>
                  </div>

                  <div className="border-t border-[#e4d2bf] pt-3">
                    <div className="grid grid-cols-3 overflow-hidden rounded-md border border-[#d8c4ad] bg-[#f2e6d8] p-1">
                      {(["image", "both", "pattern"] as PreviewMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          disabled={
                            !patternDraft &&
                            project.stitches.length === 0 &&
                            mode === "pattern"
                          }
                          className={[
                            "h-8 rounded text-xs font-medium capitalize transition disabled:opacity-35",
                            previewMode === mode
                              ? "bg-white text-[#38271d] shadow-[0_2px_8px_-6px_rgba(58,35,22,0.5)]"
                              : "text-[#765943]",
                          ].join(" ")}
                          onClick={() => setPreviewMode(mode)}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="flex flex-col gap-2 text-sm font-medium text-[#4f392b]">
                    Maximum thread colors
                    <input
                      type="range"
                      min="2"
                      max="32"
                      value={patternSettings.maxColors}
                      className="accent-[#7e4e36]"
                      onChange={(event) =>
                        updatePatternSettings({ maxColors: Number(event.target.value) })
                      }
                    />
                    <span className="font-mono text-xs font-normal text-[#8a6c55]">
                      {patternSettings.maxColors} colors maximum
                    </span>
                  </label>

                  <div>
                    <p className="text-sm font-medium text-[#4f392b]">Detail cleanup</p>
                    <div className="mt-2 grid grid-cols-3 gap-1 rounded-md border border-[#d8c4ad] bg-[#f2e6d8] p-1">
                      {(["low", "medium", "high"] as PatternSettings["detail"][]).map(
                        (detail) => (
                          <button
                            key={detail}
                            type="button"
                            className={[
                              "h-8 rounded text-xs font-medium capitalize transition",
                              patternSettings.detail === detail
                                ? "bg-white text-[#38271d]"
                                : "text-[#765943]",
                            ].join(" ")}
                            onClick={() => updatePatternSettings({ detail })}
                          >
                            {detail}
                          </button>
                        ),
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-[#4f392b]">Tent direction</p>
                    <div className="mt-2 grid grid-cols-2 gap-1 rounded-md border border-[#d8c4ad] bg-[#f2e6d8] p-1">
                      {(
                        [
                          ["slash", "/"],
                          ["backslash", "\\"],
                        ] as Array<[PatternDirection, string]>
                      ).map(([direction, label]) => (
                        <button
                          key={direction}
                          type="button"
                          aria-label={`${direction} tent stitch`}
                          className={[
                            "h-8 rounded font-mono text-base transition",
                            patternSettings.direction === direction
                              ? "bg-white text-[#38271d]"
                              : "text-[#765943]",
                          ].join(" ")}
                          onClick={() => updatePatternSettings({ direction })}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-md border border-[#e4d2bf] bg-white/70 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#765943]">
                          Removed background
                        </p>
                        <p className="mt-1 font-mono text-xs text-[#8a6c55]">
                          {patternSettings.backgroundHex ?? "None selected"}
                        </p>
                      </div>
                      {patternSettings.backgroundHex ? (
                        <button
                          type="button"
                          aria-label="Clear background color"
                          title="Clear background color"
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-[#d8c4ad] bg-white text-[#765943]"
                          onClick={() => updatePatternSettings({ backgroundHex: undefined })}
                        >
                          <X size={15} strokeWidth={1.8} />
                        </button>
                      ) : null}
                    </div>
                    {patternSettings.backgroundHex ? (
                      <label className="mt-3 flex flex-col gap-2 text-xs font-medium text-[#4f392b]">
                        Color tolerance
                        <input
                          type="range"
                          min="0"
                          max="30"
                          value={patternSettings.backgroundTolerance}
                          className="accent-[#7e4e36]"
                          onChange={(event) =>
                            updatePatternSettings({
                              backgroundTolerance: Number(event.target.value),
                            })
                          }
                        />
                        <span className="font-mono font-normal text-[#8a6c55]">
                          Delta E {patternSettings.backgroundTolerance}
                        </span>
                      </label>
                    ) : null}
                  </div>

                  {patternJob.status === "working" ? (
                    <div className="grid gap-2 rounded-md border border-[#d6bfa6] bg-[#f8efe3] px-3 py-3">
                      <div className="flex items-center justify-between gap-3 text-xs font-medium uppercase tracking-[0.08em] text-[#765943]">
                        <span>{patternJob.progress.stage}</span>
                        <span className="font-mono">{patternJob.progress.percent}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[#e2d0bd]">
                        <div
                          className="h-full origin-left rounded-full bg-[#7e4e36] transition-transform duration-300"
                          style={{ transform: `scaleX(${patternJob.progress.percent / 100})` }}
                        />
                      </div>
                      <button
                        type="button"
                        className={panelButtonClass()}
                        onClick={cancelPatternPreview}
                      >
                        <X size={16} strokeWidth={1.8} />
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={panelButtonClass("solid")}
                      disabled={!referenceImage.width}
                      onClick={generatePatternPreview}
                    >
                      <ScanLine size={16} strokeWidth={1.8} />
                      Generate preview
                    </button>
                  )}

                  {patternJob.status === "error" ? (
                    <p className="rounded-md border border-[#cfa098] bg-[#fff3ef] px-3 py-2 text-xs text-[#8a332c]">
                      {patternJob.message}
                    </p>
                  ) : null}

                  {patternDraft ? (
                    <div className="grid gap-3 border-t border-[#e4d2bf] pt-3">
                      <div className="grid grid-cols-2 gap-2 font-mono text-xs text-[#765943]">
                        <span>{patternDraft.stats.stitchedCells.toLocaleString()} stitches</span>
                        <span>{patternDraft.colors.length} colors</span>
                        <span>{newPatternColors.length} new DMC</span>
                        <span>{patternDraft.stats.backgroundCells.toLocaleString()} omitted</span>
                      </div>
                      <div className="grid max-h-36 gap-1 overflow-y-auto pr-1">
                        {patternDraft.colors.map((usage) => (
                          <div
                            key={usage.color.id}
                            className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 rounded border border-[#e4d2bf] bg-white/70 px-2 py-1.5"
                          >
                            <span
                              className="h-5 w-5 rounded-sm border border-[#d0b69c]"
                              style={{ backgroundColor: usage.color.hex }}
                            />
                            <span className="truncate text-xs text-[#4f392b]">
                              {usage.color.floss ? `DMC ${usage.color.floss}` : usage.color.name}
                            </span>
                            <span className="font-mono text-[10px] text-[#8a6c55]">
                              {usage.existing ? "Have" : "New"} {usage.count}
                            </span>
                          </div>
                        ))}
                      </div>
                      {project.stitches.length === 0 ? (
                        <button
                          type="button"
                          className={panelButtonClass("solid")}
                          onClick={() => commitPatternDraft("fill")}
                        >
                          <Check size={16} strokeWidth={1.8} />
                          Add to sheet
                        </button>
                      ) : (
                        <div className="grid gap-2">
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              className={panelButtonClass("solid")}
                              onClick={() => commitPatternDraft("fill")}
                            >
                              <Plus size={16} strokeWidth={1.8} />
                              Add empty
                            </button>
                            <button
                              type="button"
                              className={panelButtonClass(replaceConfirmed ? "solid" : "quiet")}
                              onClick={replaceWithPattern}
                            >
                              {replaceConfirmed ? (
                                <Check size={16} strokeWidth={1.8} />
                              ) : (
                                <Layers3 size={16} strokeWidth={1.8} />
                              )}
                              {replaceConfirmed ? "Confirm" : "Replace"}
                            </button>
                          </div>
                          {replaceConfirmed ? (
                            <button
                              type="button"
                              className="text-xs font-medium text-[#8a332c] underline-offset-4 hover:underline"
                              onClick={() => setReplaceConfirmed(false)}
                            >
                              Keep current stitches
                            </button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-xs leading-5 text-[#8a6c55]">
                  Upload a photo or sketch, frame it on the sheet, and match it to
                  real DMC floss.
                </p>
              )}
            </div>
          </section>

          <section className="border-t border-[#e4d2bf] pt-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#765943]">
              Sheet rotation
            </h2>
            <div className="mt-3 grid gap-3">
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  className={panelButtonClass()}
                  onClick={() => rotateViewBy(-90)}
                >
                  <RotateCcw size={16} strokeWidth={1.8} />
                  -90
                </button>
                <button
                  type="button"
                  className={panelButtonClass()}
                  onClick={() => changeViewRotation(0)}
                >
                  0 deg
                </button>
                <button
                  type="button"
                  className={panelButtonClass()}
                  onClick={() => rotateViewBy(90)}
                >
                  <RotateCw size={16} strokeWidth={1.8} />
                  90
                </button>
              </div>
              <label className="flex flex-col gap-2 text-sm font-medium text-[#4f392b]">
                Free rotation
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  value={view.rotation}
                  className="accent-[#7e4e36]"
                  onChange={(event) => changeViewRotation(Number(event.target.value))}
                />
              </label>
              <div className="flex items-center justify-between gap-2 font-mono text-xs text-[#765943]">
                <span>{Math.round(view.rotation)} deg</span>
                <button
                  type="button"
                  className="text-xs font-medium uppercase tracking-[0.08em] text-[#7e4e36] underline-offset-4 hover:underline"
                  onClick={fitView}
                >
                  Fit rotated view
                </button>
              </div>
            </div>
          </section>

          <section className="border-t border-[#e4d2bf] pt-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#765943]">
              Sheet realism
            </h2>
            <div className="mt-3 grid gap-3">
              <div className="grid grid-cols-2 gap-2 rounded-md border border-[#e4d2bf] bg-white/70 px-3 py-2 font-mono text-xs text-[#765943]">
                <span>{physicalWidth.toFixed(2)} in wide</span>
                <span>{physicalHeight.toFixed(2)} in high</span>
                <span>{meshCount}-count sheet</span>
                <span>{project.canvas.material.replace("-", " ")}</span>
                <span>
                  {stitchCellsWide} x {stitchCellsHigh} cells
                </span>
                <span>
                  {project.canvas.cols} x {project.canvas.rows} holes
                </span>
              </div>
              <label className="flex flex-col gap-2 text-sm font-medium text-[#4f392b]">
                DMC strands
                <input
                  type="range"
                  min="1"
                  max="8"
                  value={strandCount}
                  className="accent-[#7e4e36]"
                  onChange={(event) => {
                    setStrandCount(Number(event.target.value));
                    setPatternDraft(null);
                    setReplaceConfirmed(false);
                  }}
                />
              </label>
              <div className="font-mono text-xs text-[#765943]">
                {strandCount} strands, {coveragePercent}% pitch coverage
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-md border border-[#e4d2bf] bg-white/70 px-3 py-2 font-mono text-xs text-[#765943]">
                <span>{MAX_HOLE_STRAND_UNITS} strands max per hole</span>
                <span>{maxHoleLoad}/{MAX_HOLE_STRAND_UNITS} current max</span>
              </div>
              <p className="text-xs leading-5 text-[#8a6c55]">
                Three 6-strand DMC passes fill a hole; additional passes are blocked.
              </p>
            </div>
          </section>

          <section className="border-t border-[#e4d2bf] pt-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#765943]">
              Custom color
            </h2>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-2 text-sm font-medium text-[#4f392b]">
                Name
                <input
                  type="text"
                  value={customName}
                  className="h-10 rounded-md border border-[#d8c4ad] bg-white px-3 text-sm outline-none transition focus:border-[#7e4e36]"
                  onChange={(event) => setCustomName(event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-[#4f392b]">
                Color
                <input
                  type="color"
                  value={customHex}
                  className="h-10 w-full rounded-md border border-[#d8c4ad] bg-white p-1"
                  onChange={(event) => setCustomHex(event.target.value)}
                />
              </label>
              <button type="button" className={panelButtonClass()} onClick={addCustomColor}>
                <Plus size={16} strokeWidth={1.8} />
                Add thread
              </button>
            </div>
          </section>

          <section className="border-t border-[#e4d2bf] pt-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[#765943]">
              Project
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-md border border-[#d8c4ad] bg-[#f2e6d8] p-1">
              {(["letter", "a4"] as PatternPaperSize[]).map((size) => (
                <button
                  key={size}
                  type="button"
                  className={[
                    "h-8 rounded text-xs font-medium uppercase transition",
                    paperSize === size
                      ? "bg-white text-[#38271d]"
                      : "text-[#765943]",
                  ].join(" ")}
                  onClick={() => setPaperSize(size)}
                >
                  {size === "letter" ? "US Letter" : "A4"}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                className={panelButtonClass("solid")}
                disabled={exporting}
                onClick={exportPng}
              >
                {exporting ? (
                  <LoaderCircle size={16} strokeWidth={1.8} className="animate-spin" />
                ) : (
                  <Download size={16} strokeWidth={1.8} />
                )}
                {exporting ? "Exporting" : "PNG"}
              </button>
              <button
                type="button"
                className={panelButtonClass()}
                onClick={() => setShowResetConfirm(true)}
              >
                <Trash2 size={16} strokeWidth={1.8} />
                Reset
              </button>
            </div>
            <button
              type="button"
              className={`${panelButtonClass()} mt-2 w-full`}
              onClick={openSharePanel}
            >
              <Share2 size={16} strokeWidth={1.8} />
              Share project
            </button>
            {pdfJob.status === "working" ? (
              <div className="mt-2 grid gap-2 rounded-md border border-[#d6bfa6] bg-[#f8efe3] px-3 py-3">
                <div className="flex items-center justify-between gap-3 text-xs font-medium uppercase tracking-[0.08em] text-[#765943]">
                  <span className="inline-flex items-center gap-2">
                    <LoaderCircle size={14} strokeWidth={1.8} className="animate-spin" />
                    {pdfJob.progress.stage}
                  </span>
                  <span className="font-mono">{pdfJob.progress.percent}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#e2d0bd]">
                  <div
                    className="h-full origin-left rounded-full bg-[#7e4e36] transition-transform duration-300"
                    style={{ transform: `scaleX(${pdfJob.progress.percent / 100})` }}
                  />
                </div>
                <button
                  type="button"
                  className={panelButtonClass()}
                  onClick={cancelPdfExport}
                >
                  <X size={16} strokeWidth={1.8} />
                  Cancel PDF
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={`${panelButtonClass("solid")} mt-2 w-full`}
                disabled={isPdfExporting || project.stitches.length === 0}
                onClick={exportPatternPdf}
              >
                {isPdfExporting ? (
                  <LoaderCircle size={16} strokeWidth={1.8} className="animate-spin" />
                ) : (
                  <FileText size={16} strokeWidth={1.8} />
                )}
                {isPdfExporting ? "Preparing PDF" : "Printable pattern PDF"}
              </button>
            )}
            {pdfJob.status === "error" ? (
              <p className="mt-2 rounded-md border border-[#cfa098] bg-[#fff3ef] px-3 py-2 text-xs text-[#8a332c]">
                {pdfJob.message}
              </p>
            ) : null}
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[#e4d2bf] pt-4 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-[0.1em] text-[#8a6c55]">
                  Stitches
                </dt>
                <dd className="mt-1 font-mono text-lg text-[#38271d]">
                  {project.stitches.length}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.1em] text-[#8a6c55]">
                  Colors
                </dt>
                <dd className="mt-1 font-mono text-lg text-[#38271d]">
                  {usedResolvedColors.length}
                </dd>
              </div>
            </dl>
          </section>
        </aside>
        )}
      </div>
      {showResetConfirm ? (
        <div
          className="fixed inset-0 z-30 grid place-items-center bg-[#38271d]/38 px-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowResetConfirm(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-sheet-title"
            className="w-full max-w-sm rounded-lg border border-[#d6bfa6] bg-[#fff8ef] p-4 text-[#38271d] shadow-[0_28px_60px_-36px_rgba(56,39,29,0.6)]"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#cfa098] bg-[#fff3ef] text-[#8a332c]">
                <Trash2 size={19} strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <h2 id="reset-sheet-title" className="text-base font-semibold">
                  Reset sheet?
                </h2>
                <p className="mt-1 text-sm leading-5 text-[#765943]">
                  This clears the current sheet and local reference images. Undo
                  remains available for the stitch project reset.
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                className={panelButtonClass()}
                onClick={() => setShowResetConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#8a332c] bg-[#8a332c] px-3 text-sm font-medium text-[#fffaf3] transition hover:bg-[#743026] active:translate-y-px"
                onClick={resetProject}
              >
                <Trash2 size={16} strokeWidth={1.8} />
                Reset
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
