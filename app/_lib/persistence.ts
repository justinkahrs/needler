import type { PaletteColor, Project, Stitch } from "@/app/_lib/needlepointTypes";

export const PROJECT_STORAGE_KEY = "needler.project.v2";
export const LEGACY_PROJECT_STORAGE_KEY = "needler.project.v1";

type StoredStitch = [
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
  paletteIndex: number,
  strands: number,
];

type StoredProjectV2 = {
  version: 2;
  palette: PaletteColor[];
  stitches: StoredStitch[];
};

function isPaletteColor(value: unknown): value is PaletteColor {
  if (!value || typeof value !== "object") {
    return false;
  }

  const color = value as PaletteColor;
  return (
    typeof color.id === "string" &&
    typeof color.name === "string" &&
    /^#[0-9a-f]{6}$/i.test(color.hex)
  );
}
function isLegacyProject(value: unknown): value is Project {
  if (!value || typeof value !== "object") {
    return false;
  }

  const project = value as Project;
  return (
    project.version === 1 &&
    Boolean(project.canvas) &&
    Number.isInteger(project.canvas.cols) &&
    Number.isInteger(project.canvas.rows) &&
    Array.isArray(project.palette) &&
    project.palette.every(isPaletteColor) &&
    Array.isArray(project.stitches)
  );
}

function isStoredProjectV2(value: unknown): value is StoredProjectV2 {
  if (!value || typeof value !== "object") {
    return false;
  }

  const project = value as StoredProjectV2;
  return (
    project.version === 2 &&
    Array.isArray(project.palette) &&
    project.palette.every(isPaletteColor) &&
    Array.isArray(project.stitches) &&
    project.stitches.every(
      (stitch) =>
        Array.isArray(stitch) &&
        stitch.length === 6 &&
        stitch.every(Number.isFinite),
    )
  );
}

export function serializeProject(project: Project) {
  const paletteIndex = new Map(
    project.palette.map((color, index) => [color.id, index]),
  );
  const stitches: StoredStitch[] = project.stitches.flatMap((stitch) => {
    const colorIndex = paletteIndex.get(stitch.colorId);

    if (colorIndex === undefined) {
      return [];
    }

    return [
      [
        stitch.from.col,
        stitch.from.row,
        stitch.to.col,
        stitch.to.row,
        colorIndex,
        stitch.strands ?? 6,
      ],
    ];
  });

  return JSON.stringify({
    version: 2,
    palette: project.palette,
    stitches,
  } satisfies StoredProjectV2);
}

export function deserializeProject(value: unknown): Project | null {
  if (isLegacyProject(value)) {
    return value;
  }

  if (!isStoredProjectV2(value)) {
    return null;
  }

  const stitches: Stitch[] = value.stitches.flatMap((stored, index) => {
    const [fromCol, fromRow, toCol, toRow, colorIndex, strands] = stored;
    const color = value.palette[colorIndex];

    if (!color) {
      return [];
    }

    return [
      {
        id: `saved-${index.toString(36)}`,
        from: { col: fromCol, row: fromRow },
        to: { col: toCol, row: toRow },
        colorId: color.id,
        strands,
        thickness: 0,
      },
    ];
  });

  return {
    version: 1,
    canvas: {
      cols: 127,
      rows: 169,
      meshCount: 14,
      widthIn: 9,
      heightIn: 12,
      material: "perforated-paper",
    },
    palette: value.palette,
    stitches,
  };
}
