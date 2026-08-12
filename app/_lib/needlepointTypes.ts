export type Hole = { col: number; row: number };

export type Stitch = {
  id: string;
  from: Hole;
  to: Hole;
  colorId: string;
  thickness: number;
  strands?: number;
};

export type PaletteColor = {
  id: string;
  name: string;
  hex: string;
  floss?: string;
  source?: "dmc" | "custom";
};

export type SheetCanvas = {
  cols: number;
  rows: number;
  meshCount: number;
  widthIn: number;
  heightIn: number;
  material: "perforated-paper";
};

export type Project = {
  version: 1;
  canvas: SheetCanvas;
  palette: PaletteColor[];
  stitches: Stitch[];
};

export type ReferenceTransform = {
  scale: number;
  translateX: number;
  translateY: number;
  rotation: 0 | 90 | 180 | 270;
};

export type PatternDetail = "low" | "medium" | "high";
export type PatternDirection = "slash" | "backslash";

export type PatternSettings = {
  maxColors: number;
  detail: PatternDetail;
  strands: number;
  direction: PatternDirection;
  backgroundHex?: string;
  backgroundTolerance: number;
};

export type PatternColorUsage = {
  color: PaletteColor;
  count: number;
  existing: boolean;
};

export type PatternDraftStats = {
  totalCells: number;
  stitchedCells: number;
  transparentCells: number;
  backgroundCells: number;
  simplifiedCells: number;
};

export type PatternDraft = {
  cols: number;
  rows: number;
  cells: Uint16Array;
  colors: PatternColorUsage[];
  stats: PatternDraftStats;
  settings: PatternSettings;
};

export type PatternProgress = {
  stage: "sampling" | "clustering" | "matching" | "cleaning" | "complete";
  percent: number;
};

export type PatternPaperSize = "letter" | "a4";
