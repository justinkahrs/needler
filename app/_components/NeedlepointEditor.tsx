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
  Maximize2,
  Minus,
  Move,
  PenLine,
  Pipette,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  ScanLine,
  Undo2,
  X,
} from "lucide-react";
import { DMC_COLORS } from "@/app/_data/dmcColors";
import type { DmcColor } from "@/app/_data/dmcColors";
import {
  LEGACY_PROJECT_STORAGE_KEY,
  PROJECT_STORAGE_KEY,
  deserializeProject,
  serializeProject,
} from "@/app/_lib/persistence";
import type { PatternPdfProgress } from "@/app/_lib/patternPdf";
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
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

type Tool = "stitch" | "erase" | "pan" | "image" | "eyedropper";
type Point = { x: number; y: number };
type ViewState = { zoom: number; pan: Point; rotation: number };
type ReferenceImageState = {
  src: string;
  name: string;
  opacity: number;
  width: number | null;
  height: number | null;
  fit: "fit" | "fill";
  transform: ReferenceTransform;
};
type PreviewMode = "image" | "pattern" | "both";
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
    version: 1,
    canvas: makeSheetCanvas(),
    palette: DEFAULT_PALETTE.map((color) => ({ ...color })),
    stitches: [],
  };
}

function getPaletteLabel(color: PaletteColor) {
  return color.floss ? `DMC ${color.floss} ${color.name}` : color.name;
}

function normalizeProject(project: Project): Project {
  const paletteById = new Map<string, PaletteColor>();

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

  return {
    ...project,
    canvas,
    palette: [...paletteById.values()],
    stitches: project.stitches
      .map((stitch) => {
        const migratedDmc = LEGACY_COLOR_TO_DMC[stitch.colorId];
        const nextColorId = migratedDmc
          ? dmcColorId(migratedDmc)
          : stitch.colorId;
        const nextStrands =
          stitch.strands ?? getLegacyStrandsFromThickness(stitch.thickness);

        return {
          ...stitch,
          colorId: nextColorId,
          strands: nextStrands,
          thickness: getThreadWidthForStrands(nextStrands),
        };
      })
      .filter(
        (stitch) =>
          isHoleWithinCanvas(stitch.from, canvas) &&
          isHoleWithinCanvas(stitch.to, canvas),
      ),
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

function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function normalizeRotation(degrees: number) {
  const normalized = ((degrees % 360) + 360) % 360;

  return normalized > 180 ? normalized - 360 : normalized;
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
  const center = getWorldCenter(canvas);
  const radians = degreesToRadians(-view.rotation);
  const dx = point.x - view.pan.x;
  const dy = point.y - view.pan.y;
  const rotatedX = dx * Math.cos(radians) - dy * Math.sin(radians);
  const rotatedY = dx * Math.sin(radians) + dy * Math.cos(radians);

  return {
    x: rotatedX / view.zoom + center.x,
    y: rotatedY / view.zoom + center.y,
  };
}

function worldToScreen(
  point: Point,
  view: ViewState,
  canvas: Project["canvas"],
): Point {
  const center = getWorldCenter(canvas);
  const radians = degreesToRadians(view.rotation);
  const dx = (point.x - center.x) * view.zoom;
  const dy = (point.y - center.y) * view.zoom;

  return {
    x: view.pan.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: view.pan.y + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
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
  paletteMap = buildPaletteMap(project.palette),
) {
  const fillMap = new Map<string, HoleFill>();

  for (const stitch of project.stitches) {
    const strands = getStitchStrands(stitch);
    const color = paletteMap.get(stitch.colorId)?.hex ?? project.palette[0]?.hex;

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

function prepareCanvas(
  canvas: HTMLCanvasElement | null,
  viewport: Point,
): CanvasRenderingContext2D | null {
  if (!canvas || viewport.x <= 0 || viewport.y <= 0) {
    return null;
  }

  const dpr = window.devicePixelRatio || 1;
  const width = Math.floor(viewport.x);
  const height = Math.floor(viewport.y);

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return null;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  return ctx;
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
  referenceImage?: { image: HTMLImageElement; state: ReferenceImageState } | null,
) {
  const world = getWorldSize(project.canvas);
  const holeRadius = getHoleRadius(project.canvas);

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

  if (referenceImage) {
    drawReferenceImage(
      ctx,
      referenceImage.image,
      getPatternBounds(project.canvas),
      referenceImage.state,
    );
  }

  for (let y = 8; y < world.height; y += 13) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(world.width, y + 10);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  for (let row = 0; row < project.canvas.rows; row += 1) {
    for (let col = 0; col < project.canvas.cols; col += 1) {
      const point = holeToWorld({ col, row }, project.canvas);

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
  const middle = {
    x: (renderStart.x + renderEnd.x) / 2,
    y: (renderStart.y + renderEnd.y) / 2,
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
  ctx.lineCap = "round";
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
    ctx.moveTo(renderStart.x + normal.x * offset, renderStart.y + normal.y * offset);
    ctx.quadraticCurveTo(
      middle.x + normal.x * (offset + curve),
      middle.y + normal.y * (offset + curve),
      renderEnd.x + normal.x * offset,
      renderEnd.y + normal.y * offset,
    );
    ctx.stroke();
  }

  ctx.globalAlpha = alpha * 0.42;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(renderStart.x + normal.x * -2, renderStart.y + normal.y * -2);
  ctx.lineTo(renderEnd.x + normal.x * -2, renderEnd.y + normal.y * -2);
  ctx.stroke();
  ctx.restore();
}

function drawHoleThreadFill(
  ctx: CanvasRenderingContext2D,
  project: Project,
  fillMap = getHoleFillMap(project),
) {
  const holeRadius = getHoleRadius(project.canvas);

  for (const [key, fill] of fillMap) {
    if (fill.load <= 0) {
      continue;
    }

    const [col, row] = key.split(":").map(Number);
    const point = holeToWorld({ col, row }, project.canvas);
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
  color: string;
  width: number;
};

const denseStitchCache = new WeakMap<Project, DenseStitchGroup[]>();
const denseHoleFillCache = new WeakMap<Project, Map<string, HoleFill>>();
const draftPathCache = new WeakMap<PatternDraft, DenseStitchGroup[]>();

function getDenseStitchGroups(project: Project) {
  const cached = denseStitchCache.get(project);
  if (cached) return cached;

  const paletteMap = buildPaletteMap(project.palette);
  const groups = new Map<string, DenseStitchGroup>();

  for (const stitch of project.stitches) {
    const color = paletteMap.get(stitch.colorId)?.hex ?? project.palette[0]?.hex;
    if (!color) continue;
    const width = getStitchWidth(stitch);
    const key = `${color}:${width.toFixed(2)}`;
    const group = groups.get(key) ?? { path: new Path2D(), color, width };
    const start = holeToWorld(stitch.from, project.canvas);
    const end = holeToWorld(stitch.to, project.canvas);
    group.path.moveTo(start.x, start.y);
    group.path.lineTo(end.x, end.y);
    groups.set(key, group);
  }

  const result = [...groups.values()];
  denseStitchCache.set(project, result);
  return result;
}

function drawDenseStitches(ctx: CanvasRenderingContext2D, project: Project) {
  const groups = getDenseStitchGroups(project);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const group of groups) {
    ctx.save();
    ctx.shadowColor = "rgba(56, 33, 21, 0.2)";
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = 1.1;
    ctx.strokeStyle = rgba(group.color, 0.42);
    ctx.lineWidth = group.width + 2.2;
    ctx.stroke(group.path);
    ctx.restore();

    ctx.strokeStyle = group.color;
    ctx.lineWidth = group.width;
    ctx.stroke(group.path);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = Math.max(0.8, group.width * 0.12);
    ctx.stroke(group.path);
  }
  ctx.restore();

  const fillMap =
    denseHoleFillCache.get(project) ?? getHoleFillMap(project, buildPaletteMap(project.palette));
  denseHoleFillCache.set(project, fillMap);
  drawHoleThreadFill(ctx, project, fillMap);
}

function drawStitches(ctx: CanvasRenderingContext2D, project: Project) {
  if (project.stitches.length > 1200) {
    drawDenseStitches(ctx, project);
    return;
  }

  const paletteMap = buildPaletteMap(project.palette);

  for (const stitch of project.stitches) {
    const color = paletteMap.get(stitch.colorId)?.hex ?? project.palette[0]?.hex;

    if (color) {
      drawThreadStitch(ctx, stitch, color, project.canvas);
    }
  }

  drawHoleThreadFill(ctx, project, getHoleFillMap(project, paletteMap));
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
    color: usage.color.hex,
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

function drawPatternDraft(
  ctx: CanvasRenderingContext2D,
  draft: PatternDraft,
  canvas: Project["canvas"],
) {
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const group of getDraftGroups(draft, canvas)) {
    ctx.save();
    ctx.shadowColor = "rgba(56, 33, 21, 0.2)";
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = 1.1;
    ctx.strokeStyle = rgba(group.color, 0.38);
    ctx.lineWidth = group.width + 2.1;
    ctx.stroke(group.path);
    ctx.restore();
    ctx.strokeStyle = group.color;
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

function makeStitch(from: Hole, to: Hole, colorId: string, strands: number) {
  return {
    id: `stitch-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    from,
    to,
    colorId,
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
  const additions: Stitch[] = [];
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

    additions.push({
      id: `image-${batchId}-${index.toString(36)}`,
      from: holes.from,
      to: holes.to,
      colorId: color.id,
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

  return {
    project: {
      ...project,
      palette: [...project.palette, ...addedColors],
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
  const [dmcQuery, setDmcQuery] = useState("");
  const [customHex, setCustomHex] = useState("#c72b3b");
  const [customName, setCustomName] = useState("Custom thread");
  const [viewport, setViewport] = useState<Point>({ x: 0, y: 0 });
  const [view, setView] = useState<ViewState>({
    zoom: 1,
    pan: { x: 0, y: 0 },
    rotation: 0,
  });
  const [referenceImage, setReferenceImage] =
    useState<ReferenceImageState | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("both");
  const [patternSettings, setPatternSettings] = useState<PatternSettings>(
    DEFAULT_PATTERN_SETTINGS,
  );
  const [patternDraft, setPatternDraft] = useState<PatternDraft | null>(null);
  const [patternJob, setPatternJob] = useState<PatternJobState>({ status: "idle" });
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [paperSize, setPaperSize] = useState<PatternPaperSize>("letter");
  const [pdfJob, setPdfJob] = useState<PdfJobState>({ status: "idle" });

  const stageRef = useRef<HTMLDivElement | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stitchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const referenceElementRef = useRef<HTMLImageElement | null>(null);
  const patternWorkerRef = useRef<Worker | null>(null);
  const pdfWorkerRef = useRef<Worker | null>(null);
  const hasFitViewRef = useRef(false);

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
  const referenceSrc = referenceImage?.src ?? null;
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

  const notify = useCallback((message: string, tone: NoticeTone = "info") => {
    setNotice({ id: Date.now(), message, tone });
  }, []);

  const fitViewToCanvas = useCallback((canvas: Project["canvas"], rotation?: number) => {
    setView((current) => {
      const nextRotation = rotation ?? current.rotation;
      const nextWorld = getRotatedWorldBounds(canvas, nextRotation);
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
        rotation: nextRotation,
      };
    });
  }, [viewport]);

  const fitView = useCallback(() => {
    fitViewToCanvas(project.canvas);
  }, [fitViewToCanvas, project.canvas]);

  const zoomAt = useCallback((screenPoint: Point, zoomFactor: number) => {
    setView((current) => {
      const nextZoom = clamp(current.zoom * zoomFactor, MIN_ZOOM, MAX_ZOOM);
      const worldPoint = screenToWorld(screenPoint, current, project.canvas);
      const nextView = { ...current, zoom: nextZoom };
      const nextScreenPoint = worldToScreen(worldPoint, nextView, project.canvas);

      return {
        ...nextView,
        pan: {
          x: current.pan.x + screenPoint.x - nextScreenPoint.x,
          y: current.pan.y + screenPoint.y - nextScreenPoint.y,
        },
      };
    });
  }, [project.canvas]);

  const commitProject = useCallback((nextProject: Project) => {
    dispatch({ type: "commit", project: nextProject });
  }, []);

  useEffect(() => {
    let loadedProject: Project | null = null;

    try {
      for (const key of [PROJECT_STORAGE_KEY, LEGACY_PROJECT_STORAGE_KEY]) {
        const savedProject = window.localStorage.getItem(key);
        if (!savedProject) continue;
        loadedProject = deserializeProject(JSON.parse(savedProject) as unknown);
        if (loadedProject) break;
      }
    } catch {
      loadedProject = null;
    }

    const nextProject = loadedProject
      ? normalizeProject(loadedProject)
      : makeDefaultProject();

    dispatch({ type: "hydrate", project: nextProject });
  }, []);

  useEffect(() => {
    if (!state.hydrated) {
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
  }, [notify, project, state.hydrated]);

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
    if (!referenceSrc) {
      referenceElementRef.current = null;
      return;
    }

    let isActive = true;
    const image = new Image();

    image.onload = () => {
      if (!isActive) {
        return;
      }

      referenceElementRef.current = image;
      setReferenceImage((current) =>
        current?.src === referenceSrc
          ? {
              ...current,
              width: image.naturalWidth,
              height: image.naturalHeight,
            }
          : current,
      );
    };

    image.onerror = () => {
      if (!isActive) {
        return;
      }

      referenceElementRef.current = null;
      setReferenceImage(null);
      notify("Could not load that reference image.", "warn");
    };

    image.src = referenceSrc;

    return () => {
      isActive = false;
    };
  }, [notify, referenceSrc]);

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
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(stage);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!hasFitViewRef.current && viewport.x > 0 && viewport.y > 0) {
      hasFitViewRef.current = true;
      fitView();
    }
  }, [fitView, viewport]);

  useEffect(() => {
    const ctx = prepareCanvas(baseCanvasRef.current, viewport);

    if (!ctx) {
      return;
    }

    ctx.save();
    applyViewTransform(ctx, view, project.canvas);
    drawPerforatedSheet(
      ctx,
      project,
      referenceElementRef.current &&
        referenceImage &&
        previewMode !== "pattern"
        ? {
            image: referenceElementRef.current,
            state: referenceImage,
          }
        : null,
    );
    ctx.restore();
  }, [patternDraft, previewMode, project, referenceImage, view, viewport]);

  useEffect(() => {
    const ctx = prepareCanvas(stitchCanvasRef.current, viewport);

    if (!ctx) {
      return;
    }

    ctx.save();
    applyViewTransform(ctx, view, project.canvas);
    if (!patternDraft) {
      drawStitches(ctx, project);
    }
    ctx.restore();
  }, [patternDraft, project, view, viewport]);

  useEffect(() => {
    const ctx = prepareCanvas(previewCanvasRef.current, viewport);

    if (!ctx) {
      return;
    }

    ctx.save();
    applyViewTransform(ctx, view, project.canvas);
    if (patternDraft && previewMode !== "image") {
      drawPatternDraft(ctx, patternDraft, project.canvas);
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
          colorId: activeColorId,
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
    view,
    viewport,
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
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      }

      if (modKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        dispatch({ type: "redo" });
      }

      if (event.key === "Escape") {
        setDrag(null);
        setPanDrag(null);
        setImageDrag(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const screenPoint = getClientPoint(event, stageRef.current);

    if (!screenPoint) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === "pan") {
      setPanDrag({
        pointerId: event.pointerId,
        start: screenPoint,
        origin: view.pan,
      });
      return;
    }

    const worldPoint = screenToWorld(screenPoint, view, project.canvas);

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
      const image = referenceElementRef.current;
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
      const target = findNearestStitch(worldPoint, project, view);

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

    if (panDrag && panDrag.pointerId === event.pointerId) {
      setView((current) => ({
        ...current,
        pan: {
          x: panDrag.origin.x + screenPoint.x - panDrag.start.x,
          y: panDrag.origin.y + screenPoint.y - panDrag.start.y,
        },
      }));
      return;
    }

    const worldPoint = screenToWorld(screenPoint, view, project.canvas);

    if (imageDrag && imageDrag.pointerId === event.pointerId && referenceImage) {
      const bounds = getPatternBounds(project.canvas);
      setReferenceImage((current) =>
        current
          ? {
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
            }
          : current,
      );
      return;
    }

    if (tool === "erase") {
      setHoverHole(nearestHole(worldPoint, project.canvas));
      setHoveredStitchId(findNearestStitch(worldPoint, project, view)?.id ?? null);
      return;
    }

    const nextHole = nearestHole(worldPoint, project.canvas);
    setHoverHole(nextHole);

    if (drag) {
      setDrag({ ...drag, to: nextHole });
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panDrag?.pointerId === event.pointerId) {
      setPanDrag(null);
      return;
    }

    if (imageDrag?.pointerId === event.pointerId) {
      setImageDrag(null);
      return;
    }

    if (!drag) {
      return;
    }

    const screenPoint = getClientPoint(event, stageRef.current);
    const destination =
      screenPoint
        ? nearestHole(screenToWorld(screenPoint, view, project.canvas), project.canvas)
        : drag.to;

    setDrag(null);

    if (!destination || sameHole(drag.from, destination)) {
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

    commitProject({
      ...project,
      stitches: [
        ...project.stitches,
        makeStitch(drag.from, destination, activeColorId, strandCount),
      ],
    });
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();

    if (tool === "image" && referenceImage) {
      const factor = event.deltaY > 0 ? 0.92 : 1.08;
      setPatternDraft(null);
      setReplaceConfirmed(false);
      setReferenceImage((current) =>
        current
          ? {
              ...current,
              transform: {
                ...current.transform,
                scale: clamp(current.transform.scale * factor, 0.25, 4),
              },
            }
          : current,
      );
      return;
    }

    const screenPoint = getClientPoint(event, stageRef.current);

    if (!screenPoint) {
      return;
    }

    zoomAt(screenPoint, event.deltaY > 0 ? 0.9 : 1.1);
  };

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
    const id = `thread-${Date.now().toString(36)}`;
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

    commitProject(nextProject);
    setPatternDraft(null);
    setReplaceConfirmed(false);
    setSelectedColorId(INITIAL_SELECTED_COLOR_ID);
    setStrandCount(DEFAULT_STRAND_COUNT);
    fitViewToCanvas(nextProject.canvas);
    notify("Sheet reset. Undo is available.", "info");
  };

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
    setView((current) => ({
      ...current,
      rotation: normalizeRotation(current.rotation + degrees),
    }));
  };

  const changeViewRotation = (degrees: number) => {
    setView((current) => ({
      ...current,
      rotation: normalizeRotation(degrees),
    }));
  };

  const handleReferenceUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      notify("Choose an image file.", "warn");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        notify("Could not read that reference image.", "warn");
        return;
      }

      referenceElementRef.current = null;
      setReferenceImage({
        src: reader.result,
        name: file.name,
        opacity: 0.42,
        width: null,
        height: null,
        fit: "fill",
        transform: {
          scale: 1,
          translateX: 0,
          translateY: 0,
          rotation: 0,
        },
      });
      setPatternDraft(null);
      setReplaceConfirmed(false);
      setPreviewMode("both");
      setTool("image");
      notify("Reference image loaded.", "success");
    };

    reader.onerror = () => {
      notify("Could not read that reference image.", "warn");
    };

    reader.readAsDataURL(file);
  };

  const clearReferenceImage = () => {
    patternWorkerRef.current?.terminate();
    patternWorkerRef.current = null;
    referenceElementRef.current = null;
    setReferenceImage(null);
    setPatternDraft(null);
    setPatternJob({ status: "idle" });
    setReplaceConfirmed(false);
    if (tool === "image" || tool === "eyedropper") setTool("stitch");
    notify("Reference image cleared.", "info");
  };

  const resetReferenceFrame = (fit: "fit" | "fill") => {
    setReferenceImage((current) =>
      current
        ? {
            ...current,
            fit,
            transform: {
              ...current.transform,
              scale: 1,
              translateX: 0,
              translateY: 0,
            },
          }
        : current,
    );
    setPatternDraft(null);
    setReplaceConfirmed(false);
  };

  const rotateReference = () => {
    setReferenceImage((current) =>
      current
        ? {
            ...current,
            transform: {
              ...current.transform,
              rotation: ((current.transform.rotation + 90) % 360) as ReferenceTransform["rotation"],
            },
          }
        : current,
    );
    setPatternDraft(null);
    setReplaceConfirmed(false);
  };

  const cancelPatternPreview = () => {
    patternWorkerRef.current?.terminate();
    patternWorkerRef.current = null;
    setPatternJob({ status: "idle" });
    notify("Pattern conversion canceled.", "info");
  };

  const generatePatternPreview = () => {
    const image = referenceElementRef.current;
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
    const previewPng = await createPdfPreviewPng(project);
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

  return (
    <main className="min-h-[100dvh] bg-[#f3ebdf] text-[#38271d]">
      <div className="mx-auto grid min-h-[100dvh] w-full max-w-[1500px] grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[72px_minmax(0,1fr)_330px] lg:px-5">
        <aside className="order-2 flex items-center gap-2 overflow-x-auto rounded-lg border border-[#d6bfa6] bg-[#ead9c4]/78 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.52)] lg:order-1 lg:flex-col lg:overflow-visible">
          <IconButton
            label="Stitch tool"
            active={tool === "stitch"}
            onClick={() => setTool("stitch")}
          >
            <PenLine size={18} strokeWidth={1.8} />
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
            onClick={() => dispatch({ type: "undo" })}
          >
            <Undo2 size={18} strokeWidth={1.8} />
          </IconButton>
          <IconButton
            label="Redo"
            disabled={state.future.length === 0}
            onClick={() => dispatch({ type: "redo" })}
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
          <IconButton label="Export PNG" disabled={exporting} onClick={exportPng}>
            <Download size={18} strokeWidth={1.8} />
          </IconButton>
          <IconButton
            label="Export printable pattern PDF"
            disabled={pdfJob.status === "working" || project.stitches.length === 0}
            onClick={exportPatternPdf}
          >
            <FileText size={18} strokeWidth={1.8} />
          </IconButton>
          <IconButton label="Reset sheet" onClick={resetProject}>
            <RotateCcw size={18} strokeWidth={1.8} />
          </IconButton>
        </aside>

        <section className="order-1 flex min-h-[66dvh] min-w-0 flex-col rounded-lg border border-[#cfb69c] bg-[#f8f0e5] shadow-[0_20px_44px_-28px_rgba(87,55,35,0.36)] lg:order-2 lg:min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dec9b1] px-4 py-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-[#332419]">
                Needler
              </h1>
              <p className="text-sm text-[#765943]">
                {physicalWidth} x {physicalHeight} in, {meshCount}-count
                perforated paper
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-[#765943]">
              <span className="h-2 w-2 rounded-full bg-[#6f8d62]" />
              {state.hydrated ? "Saved locally" : "Loading"}
            </div>
          </div>

          <div
            ref={stageRef}
            className={[
              "relative min-h-[560px] flex-1 overflow-hidden bg-[#d6bd9f] touch-none lg:min-h-0",
              tool === "image"
                ? imageDrag
                  ? "cursor-grabbing"
                  : "cursor-grab"
                : tool === "eyedropper"
                  ? "cursor-crosshair"
                  : "",
            ].join(" ")}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => {
              setDrag(null);
              setPanDrag(null);
              setImageDrag(null);
            }}
            onWheel={handleWheel}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.34),transparent_28%),linear-gradient(135deg,#dec4a4,#c59d75)]" />
            <canvas ref={baseCanvasRef} className="absolute inset-0" />
            <canvas ref={stitchCanvasRef} className="absolute inset-0" />
            <canvas ref={previewCanvasRef} className="absolute inset-0" />
            {patternJob.status === "working" ? (
              <div className="pointer-events-none absolute left-1/2 top-4 w-[min(320px,calc(100%-32px))] -translate-x-1/2 rounded-md border border-[#d6bfa6] bg-[#fff8ef]/94 px-3 py-3 shadow-[0_14px_28px_-22px_rgba(58,35,22,0.5)]">
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
              <div className="pointer-events-none absolute left-4 top-4 max-w-[230px] rounded-md border border-[#e2cbb2] bg-[#fff8ef]/88 px-3 py-2 text-sm text-[#765943] shadow-[0_12px_30px_-24px_rgba(58,35,22,0.42)]">
                No stitches yet
              </div>
            ) : null}
            {notice ? (
              <div
                className={[
                  "pointer-events-none absolute bottom-4 left-4 max-w-[280px] rounded-md border px-3 py-2 text-sm font-medium shadow-[0_12px_30px_-22px_rgba(58,35,22,0.48)]",
                  notice.tone === "warn"
                    ? "border-[#cfa098] bg-[#fff3ef] text-[#8a332c]"
                    : notice.tone === "success"
                      ? "border-[#b8c59e] bg-[#f4f8ed] text-[#536842]"
                      : "border-[#e2cbb2] bg-[#fff8ef] text-[#765943]",
                ].join(" ")}
              >
                {notice.message}
              </div>
            ) : null}
            <div className="pointer-events-none absolute right-4 top-4 grid gap-1 rounded-md border border-[#e2cbb2] bg-[#fff8ef]/88 px-3 py-2 text-right font-mono text-xs text-[#765943]">
              <span>{Math.round(view.zoom * 100)}%</span>
              <span>{Math.round(view.rotation)} deg</span>
            </div>
          </div>
        </section>

        <aside className="order-3 flex flex-col gap-4 rounded-lg border border-[#d6bfa6] bg-[#fff8ef] p-4 shadow-[0_20px_44px_-30px_rgba(87,55,35,0.32)] lg:max-h-[calc(100dvh-2rem)] lg:overflow-auto">
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
              {project.palette.map((color) => (
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
                {referenceImage ? "Replace image" : "Upload image"}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={handleReferenceUpload}
                />
              </label>
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
                      onChange={(event) => {
                        setReferenceImage((current) =>
                          current
                            ? {
                                ...current,
                                transform: {
                                  ...current.transform,
                                  scale: Number(event.target.value),
                                },
                              }
                            : current,
                        );
                        setPatternDraft(null);
                        setReplaceConfirmed(false);
                      }}
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
                        setReferenceImage((current) =>
                          current
                            ? {
                                ...current,
                                opacity: Number(event.target.value),
                              }
                            : current,
                        )
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
                      Clear
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
                          onClick={() => commitPatternDraft("replace")}
                        >
                          <Check size={16} strokeWidth={1.8} />
                          Apply pattern
                        </button>
                      ) : (
                        <div className="grid gap-2">
                          <div className="grid grid-cols-2 gap-2">
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
                            <button
                              type="button"
                              className={panelButtonClass("solid")}
                              onClick={() => commitPatternDraft("fill")}
                            >
                              <Plus size={16} strokeWidth={1.8} />
                              Fill empty
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
                <Download size={16} strokeWidth={1.8} />
                {exporting ? "Exporting" : "PNG"}
              </button>
              <button type="button" className={panelButtonClass()} onClick={resetProject}>
                <RotateCcw size={16} strokeWidth={1.8} />
                Reset
              </button>
            </div>
            {pdfJob.status === "working" ? (
              <div className="mt-2 grid gap-2 rounded-md border border-[#d6bfa6] bg-[#f8efe3] px-3 py-3">
                <div className="flex items-center justify-between gap-3 text-xs font-medium uppercase tracking-[0.08em] text-[#765943]">
                  <span>{pdfJob.progress.stage}</span>
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
                disabled={project.stitches.length === 0}
                onClick={exportPatternPdf}
              >
                <FileText size={16} strokeWidth={1.8} />
                Printable pattern PDF
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
                  {project.palette.length}
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </main>
  );
}
