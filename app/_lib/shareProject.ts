import {
  MAX_HOLE_STRAND_UNITS,
  canAddStitchWithLoadMap,
  holeKey,
} from "@/app/_lib/needlepointRules";
import type {
  PaletteColor,
  Project,
  Stitch,
} from "@/app/_lib/needlepointTypes";
import { deserializeProject } from "@/app/_lib/persistence";
import {
  getAllStitches,
  getVisibleStitches,
  validateVisibleComposite,
} from "@/app/_lib/layers";

export const SHARE_HASH_PREFIX = "#share=v2.";
const LEGACY_SHARE_HASH_PREFIX = "#share=v1.";
export const PRACTICAL_SHARE_URL_LIMIT = 48_000;
export const NEEDLER_FILE_EXTENSION = ".needler";

const SHARE_FORMAT_VERSION = 2 as const;
const LEGACY_SHARE_FORMAT_VERSION = 1 as const;
const GRID_COLS = 126;
const GRID_ROWS = 168;
const GRID_CELL_COUNT = GRID_COLS * GRID_ROWS;
const MAX_TRANSPORT_BYTES = 1_500_000;
const MAX_DECOMPRESSED_BYTES = 8_000_000;
const FILE_MAGIC = new Uint8Array([0x4e, 0x44, 0x4c, 0x52, 0x01]);

type StoredAssignment = [roleIndex: number, paletteIndex: number];
type CompactPaletteColor = [
  id: string,
  name: string,
  hex: string,
  floss: string,
  source: 0 | 1 | 2,
];
type CompactColorway = [
  id: string,
  name: string,
  assignments: StoredAssignment[],
];
type CompactStitch = [
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
  roleIndex: number,
  strands: number,
];
type CompactGridStyle = [
  roleIndex: number,
  strands: number,
  orientation: 0 | 1 | 2 | 3,
];
type CompactSharePayload = {
  v: 1;
  p: CompactPaletteColor[];
  r: Array<[id: string, originalPaletteIndex: number]>;
  a: StoredAssignment[];
  w: CompactColorway[];
  x?: number;
  z?: number;
  m: "g" | "s";
  t?: CompactGridStyle[];
  g?: string;
  e?: CompactStitch[];
  q?: number[];
  s?: CompactStitch[];
};
type CompactLayerPayload = {
  i: string;
  n: string;
  v?: 0;
  k?: 1;
  m: "g" | "s";
  t?: CompactGridStyle[];
  g?: string;
  e?: CompactStitch[];
  q?: number[];
  s?: CompactStitch[];
};
type CompactSharePayloadV2 = Omit<
  CompactSharePayload,
  "v" | "m" | "t" | "g" | "e" | "q" | "s"
> & {
  v: 2;
  y?: number;
  l: CompactLayerPayload[];
};

export type EncodedShareProject = {
  token: string;
  transport: Uint8Array;
  mode: "grid" | "stitches";
  compressedBytes: number;
  uncompressedBytes: number;
};

export type DecodedShareProject = {
  project: Project;
  rotation: number;
  mode: "grid" | "stitches";
};

export class ShareProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShareProjectError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function normalizeRotation(rotation: number) {
  if (!Number.isFinite(rotation)) return 0;
  const normalized = ((rotation % 360) + 360) % 360;
  const signed = normalized > 180 ? normalized - 360 : normalized;
  return Math.round(signed * 1000) / 1000;
}

function sourceCode(source: PaletteColor["source"]): 0 | 1 | 2 {
  if (source === "dmc") return 1;
  if (source === "custom") return 2;
  return 0;
}

function sourceFromCode(source: number): PaletteColor["source"] {
  if (source === 1) return "dmc";
  if (source === 2) return "custom";
  return undefined;
}

function serializeAssignments(
  assignments: Record<string, string>,
  roleIndex: Map<string, number>,
  paletteIndex: Map<string, number>,
) {
  return Object.entries(assignments)
    .map(([roleId, colorId]) => {
      const storedRole = roleIndex.get(roleId);
      const storedColor = paletteIndex.get(colorId);
      if (storedRole === undefined || storedColor === undefined) {
        throw new ShareProjectError("The project contains an invalid color assignment.");
      }
      return [storedRole, storedColor] as StoredAssignment;
    })
    .sort((left, right) => left[0] - right[0]);
}

function unitStitchCell(stitch: Stitch) {
  const minCol = Math.min(stitch.from.col, stitch.to.col);
  const minRow = Math.min(stitch.from.row, stitch.to.row);
  if (
    Math.abs(stitch.to.col - stitch.from.col) !== 1 ||
    Math.abs(stitch.to.row - stitch.from.row) !== 1 ||
    minCol < 0 ||
    minRow < 0 ||
    minCol >= GRID_COLS ||
    minRow >= GRID_ROWS
  ) {
    return null;
  }

  let orientation: CompactGridStyle[2];
  if (stitch.from.col === minCol && stitch.from.row === minRow + 1) {
    orientation = 0;
  } else if (stitch.from.col === minCol + 1 && stitch.from.row === minRow) {
    orientation = 1;
  } else if (stitch.from.col === minCol && stitch.from.row === minRow) {
    orientation = 2;
  } else {
    orientation = 3;
  }

  return {
    index: minRow * GRID_COLS + minCol,
    orientation,
  };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new ShareProjectError("The shared project contains invalid encoded data.");
  }
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    throw new ShareProjectError("The shared project contains invalid encoded data.");
  }
}

function bytesToBase64Url(bytes: Uint8Array) {
  return bytesToBase64(bytes)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function base64UrlToBytes(value: string) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new ShareProjectError("This share link is not valid.");
  }
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  return base64ToBytes(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
}

function uint16ToBase64(values: Uint16Array) {
  const bytes = new Uint8Array(values.length * 2);
  for (let index = 0; index < values.length; index += 1) {
    bytes[index * 2] = values[index] & 0xff;
    bytes[index * 2 + 1] = values[index] >> 8;
  }
  return bytesToBase64(bytes);
}

function base64ToUint16(value: string, expectedLength: number) {
  const bytes = base64ToBytes(value);
  if (bytes.length !== expectedLength * 2) {
    throw new ShareProjectError("The shared stitch grid has the wrong size.");
  }
  const values = new Uint16Array(expectedLength);
  for (let index = 0; index < expectedLength; index += 1) {
    values[index] = bytes[index * 2] | (bytes[index * 2 + 1] << 8);
  }
  return values;
}

function copyArrayBuffer(bytes: Uint8Array) {
  return bytes.slice().buffer;
}

async function readStreamWithLimit(
  stream: ReadableStream<Uint8Array>,
  limit: number,
) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new ShareProjectError("The shared project is too large to open safely.");
    }
    chunks.push(value);
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function gzip(bytes: Uint8Array) {
  if (typeof CompressionStream === "undefined") return null;
  const stream = new Blob([copyArrayBuffer(bytes)])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return readStreamWithLimit(stream, MAX_TRANSPORT_BYTES);
}

async function gunzip(bytes: Uint8Array) {
  if (typeof DecompressionStream === "undefined") {
    throw new ShareProjectError(
      "This browser cannot open compressed Needler projects.",
    );
  }
  const stream = new Blob([copyArrayBuffer(bytes)])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return readStreamWithLimit(stream, MAX_DECOMPRESSED_BYTES);
}

function encodeDenseGrid(
  stitches: Stitch[],
  roleIndex: Map<string, number>,
) {
  if (stitches.length === 0) return null;

  const unitCells = stitches.map(unitStitchCell);
  const cellCounts = new Map<number, number>();
  for (const unit of unitCells) {
    if (unit) cellCounts.set(unit.index, (cellCounts.get(unit.index) ?? 0) + 1);
  }
  const cells = new Uint16Array(GRID_CELL_COUNT);
  const styles: CompactGridStyle[] = [];
  const styleIndex = new Map<string, number>();
  const exceptions: CompactStitch[] = [];
  const exceptionPositions: number[] = [];
  let previousCell = -1;

  for (let index = 0; index < stitches.length; index += 1) {
    const stitch = stitches[index];
    const unit = unitCells[index];
    const storedRole = roleIndex.get(stitch.colorRoleId);
    const strands = stitch.strands ?? 6;
    if (storedRole === undefined) {
      throw new ShareProjectError("A stitch references an unknown color role.");
    }
    if (
      !unit ||
      cellCounts.get(unit.index) !== 1 ||
      unit.index <= previousCell
    ) {
      exceptions.push([
        stitch.from.col,
        stitch.from.row,
        stitch.to.col,
        stitch.to.row,
        storedRole,
        strands,
      ]);
      exceptionPositions.push(index);
      continue;
    }

    const key = `${storedRole}:${strands}:${unit.orientation}`;
    let storedStyle = styleIndex.get(key);
    if (storedStyle === undefined) {
      if (styles.length >= 65_534) return null;
      storedStyle = styles.length;
      styleIndex.set(key, storedStyle);
      styles.push([storedRole, strands, unit.orientation]);
    }
    cells[unit.index] = storedStyle + 1;
    previousCell = unit.index;
  }

  return styles.length > 0
    ? { cells, styles, exceptions, exceptionPositions }
    : null;
}

function encodeStitchPayload(stitches: Stitch[], roleIndex: Map<string, number>) {
  const dense = encodeDenseGrid(stitches, roleIndex);

  if (dense) {
    return {
      m: "g" as const,
      t: dense.styles,
      g: uint16ToBase64(dense.cells),
      ...(dense.exceptions.length > 0
        ? { e: dense.exceptions, q: dense.exceptionPositions }
        : {}),
    };
  }

  return {
    m: "s" as const,
    s: stitches.map((stitch) => {
      const storedRole = roleIndex.get(stitch.colorRoleId);
      if (storedRole === undefined) {
        throw new ShareProjectError("A stitch references an unknown color role.");
      }
      return [
        stitch.from.col,
        stitch.from.row,
        stitch.to.col,
        stitch.to.row,
        storedRole,
        stitch.strands ?? 6,
      ] as CompactStitch;
    }),
  };
}

function makeCompactPayload(project: Project, rotation: number): CompactSharePayloadV2 {
  validateSharedProject(project);

  const paletteIndex = new Map(
    project.palette.map((color, index) => [color.id, index]),
  );
  if (paletteIndex.size !== project.palette.length) {
    throw new ShareProjectError("The project contains duplicate thread colors.");
  }

  const roles = project.colors.roles.map((role) => {
    const originalIndex = paletteIndex.get(role.originalColorId);
    if (originalIndex === undefined) {
      throw new ShareProjectError("A color role is missing its original thread.");
    }
    return [role.id, originalIndex] as [string, number];
  });
  const roleIndex = new Map(roles.map(([id], index) => [id, index]));
  if (roleIndex.size !== roles.length) {
    throw new ShareProjectError("The project contains duplicate color roles.");
  }

  const activeColorwayIndex = project.colors.activeColorwayId
    ? project.colors.colorways.findIndex(
        (colorway) => colorway.id === project.colors.activeColorwayId,
      )
    : -1;
  const common = {
    v: SHARE_FORMAT_VERSION,
    p: project.palette.map(
      (color) => [
        color.id,
        color.name,
        color.hex,
        color.floss ?? "",
        sourceCode(color.source),
      ] as CompactPaletteColor,
    ),
    r: roles,
    a: serializeAssignments(project.colors.current, roleIndex, paletteIndex),
    w: project.colors.colorways.map(
      (colorway) => [
        colorway.id,
        colorway.name,
        serializeAssignments(colorway.assignments, roleIndex, paletteIndex),
      ] as CompactColorway,
    ),
    ...(activeColorwayIndex >= 0 ? { x: activeColorwayIndex } : {}),
    ...(normalizeRotation(rotation) !== 0
      ? { z: normalizeRotation(rotation) }
      : {}),
  };
  const activeLayerIndex = project.layers.findIndex(
    (layer) => layer.id === project.activeLayerId,
  );

  return {
    ...common,
    l: project.layers.map((layer) => ({
      i: layer.id,
      n: layer.name,
      ...(layer.visible ? {} : { v: 0 as const }),
      ...(layer.locked ? { k: 1 as const } : {}),
      ...encodeStitchPayload(layer.stitches, roleIndex),
    })),
    ...(activeLayerIndex >= 0 ? { y: activeLayerIndex } : {}),
  };
}

async function encodeTransport(jsonBytes: Uint8Array) {
  const compressed = await gzip(jsonBytes);
  const useCompressed = compressed && compressed.length < jsonBytes.length;
  const body = useCompressed ? compressed : jsonBytes;
  const transport = new Uint8Array(body.length + 1);
  transport[0] = useCompressed ? 1 : 0;
  transport.set(body, 1);
  return transport;
}

async function decodeTransport(transport: Uint8Array) {
  if (transport.length < 2 || transport.length > MAX_TRANSPORT_BYTES) {
    throw new ShareProjectError("The shared project has an invalid size.");
  }
  const body = transport.subarray(1);
  if (transport[0] === 0) {
    if (body.length > MAX_DECOMPRESSED_BYTES) {
      throw new ShareProjectError("The shared project is too large to open safely.");
    }
    return body;
  }
  if (transport[0] !== 1) {
    throw new ShareProjectError("This Needler share format is not supported.");
  }
  return gunzip(body);
}

function decodePalette(value: unknown) {
  if (!Array.isArray(value) || value.length > 1_024) {
    throw new ShareProjectError("The shared project has an invalid thread palette.");
  }
  const ids = new Set<string>();
  return value.map((entry): PaletteColor => {
    if (
      !Array.isArray(entry) ||
      entry.length !== 5 ||
      typeof entry[0] !== "string" ||
      entry[0].length === 0 ||
      entry[0].length > 160 ||
      typeof entry[1] !== "string" ||
      entry[1].length > 160 ||
      typeof entry[2] !== "string" ||
      !/^#[0-9a-f]{6}$/iu.test(entry[2]) ||
      typeof entry[3] !== "string" ||
      entry[3].length > 32 ||
      !isInteger(entry[4]) ||
      entry[4] < 0 ||
      entry[4] > 2 ||
      ids.has(entry[0])
    ) {
      throw new ShareProjectError("The shared project has an invalid thread palette.");
    }
    ids.add(entry[0]);
    const source = sourceFromCode(entry[4]);
    return {
      id: entry[0],
      name: entry[1],
      hex: entry[2],
      ...(entry[3] ? { floss: entry[3] } : {}),
      ...(source ? { source } : {}),
    };
  });
}

function decodeAssignments(
  value: unknown,
  roleCount: number,
  paletteCount: number,
) {
  if (!Array.isArray(value) || value.length > roleCount) {
    throw new ShareProjectError("The shared project has invalid color assignments.");
  }
  const roles = new Set<number>();
  return value.map((entry): StoredAssignment => {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      !isInteger(entry[0]) ||
      entry[0] < 0 ||
      entry[0] >= roleCount ||
      !isInteger(entry[1]) ||
      entry[1] < 0 ||
      entry[1] >= paletteCount ||
      roles.has(entry[0])
    ) {
      throw new ShareProjectError("The shared project has invalid color assignments.");
    }
    roles.add(entry[0]);
    return [entry[0], entry[1]];
  });
}

function decodeRoles(value: unknown, paletteCount: number) {
  if (!Array.isArray(value) || value.length > 1_024) {
    throw new ShareProjectError("The shared project has invalid color roles.");
  }
  const ids = new Set<string>();
  return value.map((entry): [string, number] => {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== "string" ||
      entry[0].length === 0 ||
      entry[0].length > 160 ||
      ids.has(entry[0]) ||
      !isInteger(entry[1]) ||
      entry[1] < 0 ||
      entry[1] >= paletteCount
    ) {
      throw new ShareProjectError("The shared project has invalid color roles.");
    }
    ids.add(entry[0]);
    return [entry[0], entry[1]];
  });
}

function decodeStitchTuple(value: unknown, roleCount: number): CompactStitch {
  if (
    !Array.isArray(value) ||
    value.length !== 6 ||
    !value.every(isInteger) ||
    value[0] < 0 ||
    value[0] > GRID_COLS ||
    value[1] < 0 ||
    value[1] > GRID_ROWS ||
    value[2] < 0 ||
    value[2] > GRID_COLS ||
    value[3] < 0 ||
    value[3] > GRID_ROWS ||
    value[4] < 0 ||
    value[4] >= roleCount ||
    value[5] < 1 ||
    value[5] > 8 ||
    (value[0] === value[2] && value[1] === value[3])
  ) {
    throw new ShareProjectError("The shared project contains an invalid stitch.");
  }
  return value as CompactStitch;
}

function stitchFromGridCell(
  cellIndex: number,
  style: CompactGridStyle,
): CompactStitch {
  const col = cellIndex % GRID_COLS;
  const row = Math.floor(cellIndex / GRID_COLS);
  const [roleIndex, strands, orientation] = style;
  if (orientation === 0) return [col, row + 1, col + 1, row, roleIndex, strands];
  if (orientation === 1) return [col + 1, row, col, row + 1, roleIndex, strands];
  if (orientation === 2) return [col, row, col + 1, row + 1, roleIndex, strands];
  return [col + 1, row + 1, col, row, roleIndex, strands];
}

function decodeStitchPayload(
  value: Record<string, unknown>,
  roleCount: number,
): { stitches: CompactStitch[]; mode: DecodedShareProject["mode"] } {
  let stitches: CompactStitch[];
  let mode: DecodedShareProject["mode"];

  if (value.m === "g") {
    if (!Array.isArray(value.t) || value.t.length > 65_534 || typeof value.g !== "string") {
      throw new ShareProjectError("The shared project has an invalid stitch grid.");
    }
    const styles = value.t.map((style): CompactGridStyle => {
      if (
        !Array.isArray(style) ||
        style.length !== 3 ||
        !style.every(isInteger) ||
        style[0] < 0 ||
        style[0] >= roleCount ||
        style[1] < 1 ||
        style[1] > 8 ||
        style[2] < 0 ||
        style[2] > 3
      ) {
        throw new ShareProjectError("The shared project has an invalid stitch style.");
      }
      return style as CompactGridStyle;
    });
    const cells = base64ToUint16(value.g, GRID_CELL_COUNT);
    stitches = [];
    for (let index = 0; index < cells.length; index += 1) {
      const code = cells[index];
      if (code === 0) continue;
      const style = styles[code - 1];
      if (!style) {
        throw new ShareProjectError("The shared stitch grid uses an unknown style.");
      }
      stitches.push(stitchFromGridCell(index, style));
    }
    if (value.e !== undefined || value.q !== undefined) {
      if (
        !Array.isArray(value.e) ||
        !Array.isArray(value.q) ||
        value.e.length !== value.q.length ||
        value.e.length > 200_000
      ) {
        throw new ShareProjectError("The shared project has invalid stitch exceptions.");
      }
      const exceptions = value.e.map((entry) =>
        decodeStitchTuple(entry, roleCount),
      );
      const totalStitches = stitches.length + exceptions.length;
      let previousPosition = -1;
      const positions = value.q.map((position) => {
        if (
          !isInteger(position) ||
          position <= previousPosition ||
          position < 0 ||
          position >= totalStitches
        ) {
          throw new ShareProjectError(
            "The shared project has invalid stitch exception ordering.",
          );
        }
        previousPosition = position;
        return position;
      });
      const merged: CompactStitch[] = [];
      let gridIndex = 0;
      let exceptionIndex = 0;
      for (let index = 0; index < totalStitches; index += 1) {
        if (positions[exceptionIndex] === index) {
          merged.push(exceptions[exceptionIndex]);
          exceptionIndex += 1;
        } else {
          const stitch = stitches[gridIndex];
          if (!stitch) {
            throw new ShareProjectError("The shared stitch ordering is incomplete.");
          }
          merged.push(stitch);
          gridIndex += 1;
        }
      }
      stitches = merged;
    }
    mode = "grid";
  } else if (value.m === "s") {
    if (!Array.isArray(value.s) || value.s.length > 200_000) {
      throw new ShareProjectError("The shared project has an invalid stitch list.");
    }
    stitches = value.s.map((stitch) => decodeStitchTuple(stitch, roleCount));
    mode = "stitches";
  } else {
    throw new ShareProjectError("The shared project has an unknown stitch encoding.");
  }

  return { stitches, mode };
}

function decodeCompactPayload(value: unknown): DecodedShareProject {
  if (
    !isRecord(value) ||
    (value.v !== SHARE_FORMAT_VERSION && value.v !== LEGACY_SHARE_FORMAT_VERSION)
  ) {
    throw new ShareProjectError("This Needler share format is not supported.");
  }

  const palette = decodePalette(value.p);
  const roles = decodeRoles(value.r, palette.length);
  const current = decodeAssignments(value.a, roles.length, palette.length);
  if (!Array.isArray(value.w) || value.w.length > 100) {
    throw new ShareProjectError("The shared project has invalid colorways.");
  }
  const colorwayIds = new Set<string>();
  const colorways = value.w.map((entry) => {
    if (
      !Array.isArray(entry) ||
      entry.length !== 3 ||
      typeof entry[0] !== "string" ||
      entry[0].length === 0 ||
      entry[0].length > 160 ||
      colorwayIds.has(entry[0]) ||
      typeof entry[1] !== "string" ||
      entry[1].length > 160
    ) {
      throw new ShareProjectError("The shared project has invalid colorways.");
    }
    colorwayIds.add(entry[0]);
    return {
      id: entry[0],
      name: entry[1],
      assignments: decodeAssignments(entry[2], roles.length, palette.length),
    };
  });

  const activeIndex = value.x;
  if (
    activeIndex !== undefined &&
    (!isInteger(activeIndex) || activeIndex < 0 || activeIndex >= colorways.length)
  ) {
    throw new ShareProjectError("The shared project has an invalid active colorway.");
  }
  if (value.z !== undefined && typeof value.z !== "number") {
    throw new ShareProjectError("The shared project has an invalid sheet rotation.");
  }

  let storedProject: unknown;
  let mode: DecodedShareProject["mode"];

  if (value.v === LEGACY_SHARE_FORMAT_VERSION) {
    const decoded = decodeStitchPayload(value, roles.length);
    mode = decoded.mode;
    storedProject = {
      version: 3,
      palette,
      roles,
      current,
      colorways,
      ...(activeIndex === undefined
        ? {}
        : { activeColorwayId: colorways[activeIndex].id }),
      stitches: decoded.stitches,
    };
  } else {
    if (!Array.isArray(value.l) || value.l.length === 0 || value.l.length > 100) {
      throw new ShareProjectError("The shared project has invalid layers.");
    }
    const layerIds = new Set<string>();
    const decodedLayers = value.l.map((entry): {
      id: string;
      name: string;
      visible: boolean;
      locked: boolean;
      stitches: CompactStitch[];
      mode: DecodedShareProject["mode"];
    } => {
      if (
        !isRecord(entry) ||
        typeof entry.i !== "string" ||
        entry.i.length === 0 ||
        entry.i.length > 160 ||
        layerIds.has(entry.i) ||
        typeof entry.n !== "string" ||
        entry.n.length === 0 ||
        entry.n.length > 160 ||
        (entry.v !== undefined && entry.v !== 0) ||
        (entry.k !== undefined && entry.k !== 1)
      ) {
        throw new ShareProjectError("The shared project has invalid layers.");
      }
      layerIds.add(entry.i);
      const decoded = decodeStitchPayload(entry, roles.length);
      return {
        id: entry.i,
        name: entry.n,
        visible: entry.v !== 0,
        locked: entry.k === 1,
        stitches: decoded.stitches,
        mode: decoded.mode,
      };
    });
    const activeLayerIndex = value.y;
    if (
      activeLayerIndex !== undefined &&
      (!isInteger(activeLayerIndex) ||
        activeLayerIndex < 0 ||
        activeLayerIndex >= decodedLayers.length)
    ) {
      throw new ShareProjectError("The shared project has an invalid active layer.");
    }
    mode = decodedLayers.every((layer) => layer.mode === "grid") ? "grid" : "stitches";
    storedProject = {
      version: 4,
      palette,
      roles,
      current,
      colorways,
      ...(activeIndex === undefined
        ? {}
        : { activeColorwayId: colorways[activeIndex].id }),
      ...(activeLayerIndex === undefined
        ? {}
        : { activeLayerId: decodedLayers[activeLayerIndex].id }),
      layers: decodedLayers.map((layer) => ({
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        locked: layer.locked,
        stitches: layer.stitches,
      })),
    };
  }

  const project = deserializeProject(storedProject);
  if (!project) {
    throw new ShareProjectError("The shared project could not be reconstructed.");
  }
  validateSharedProject(project);

  return {
    project,
    rotation: normalizeRotation(typeof value.z === "number" ? value.z : 0),
    mode,
  };
}

export function validateSharedProject(project: Project) {
  if (
    project.canvas.cols !== GRID_COLS + 1 ||
    project.canvas.rows !== GRID_ROWS + 1 ||
    project.canvas.meshCount !== 14 ||
    project.canvas.widthIn !== 9 ||
    project.canvas.heightIn !== 12
  ) {
    throw new ShareProjectError("The shared project does not use the 9 x 12 sheet.");
  }

  const paletteIds = new Set(project.palette.map((color) => color.id));
  const roleIds = new Set(project.colors.roles.map((role) => role.id));
  if (
    paletteIds.size !== project.palette.length ||
    roleIds.size !== project.colors.roles.length ||
    project.colors.roles.some((role) => !paletteIds.has(role.originalColorId))
  ) {
    throw new ShareProjectError("The shared project has invalid color data.");
  }
  const assignmentsAreValid = (assignments: Record<string, string>) =>
    Object.entries(assignments).every(
      ([roleId, colorId]) => roleIds.has(roleId) && paletteIds.has(colorId),
    );
  if (
    !assignmentsAreValid(project.colors.current) ||
    project.colors.colorways.some(
      (colorway) => !assignmentsAreValid(colorway.assignments),
    )
  ) {
    throw new ShareProjectError("The shared project has invalid color assignments.");
  }

  if (
    project.layers.length === 0 ||
    !project.layers.some((layer) => layer.id === project.activeLayerId)
  ) {
    throw new ShareProjectError("The shared project has invalid layers.");
  }
  const layerIds = new Set<string>();
  for (const layer of project.layers) {
    if (
      !layer.id ||
      !layer.name ||
      layerIds.has(layer.id) ||
      typeof layer.visible !== "boolean" ||
      typeof layer.locked !== "boolean"
    ) {
      throw new ShareProjectError("The shared project has invalid layers.");
    }
    layerIds.add(layer.id);
  }

  const loadMap = new Map<string, number>();
  for (const stitch of getAllStitches(project)) {
    const strands = stitch.strands ?? 6;
    const coordinates = [
      stitch.from.col,
      stitch.from.row,
      stitch.to.col,
      stitch.to.row,
    ];
    if (
      !coordinates.every(Number.isInteger) ||
      stitch.from.col < 0 ||
      stitch.from.col > GRID_COLS ||
      stitch.from.row < 0 ||
      stitch.from.row > GRID_ROWS ||
      stitch.to.col < 0 ||
      stitch.to.col > GRID_COLS ||
      stitch.to.row < 0 ||
      stitch.to.row > GRID_ROWS ||
      (stitch.from.col === stitch.to.col && stitch.from.row === stitch.to.row) ||
      !Number.isInteger(strands) ||
      strands < 1 ||
      strands > 8 ||
      !roleIds.has(stitch.colorRoleId)
    ) {
      throw new ShareProjectError("The shared project contains an invalid stitch.");
    }
  }

  for (const stitch of getVisibleStitches(project)) {
    const strands = stitch.strands ?? 6;
    const capacity = canAddStitchWithLoadMap(
      loadMap,
      stitch.from,
      stitch.to,
      strands,
    );
    if (!capacity.canAdd) {
      throw new ShareProjectError(
        `The shared project exceeds the ${MAX_HOLE_STRAND_UNITS}-strand hole capacity.`,
      );
    }
    for (const hole of [stitch.from, stitch.to]) {
      const key = holeKey(hole);
      loadMap.set(key, (loadMap.get(key) ?? 0) + strands);
    }
  }

  const visibleValidation = validateVisibleComposite(project);
  if (!visibleValidation.ok) {
    throw new ShareProjectError(visibleValidation.reason);
  }
}

export async function encodeShareProject(
  project: Project,
  rotation = 0,
): Promise<EncodedShareProject> {
  const payload = makeCompactPayload(project, rotation);
  const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));
  if (jsonBytes.length > MAX_DECOMPRESSED_BYTES) {
    throw new ShareProjectError("This project is too large to share from the browser.");
  }
  const transport = await encodeTransport(jsonBytes);
  return {
    token: bytesToBase64Url(transport),
    transport,
    mode: payload.l.every((layer) => layer.m === "g") ? "grid" : "stitches",
    compressedBytes: transport.byteLength,
    uncompressedBytes: jsonBytes.byteLength,
  };
}

export async function decodeShareProject(
  token: string,
): Promise<DecodedShareProject> {
  if (!token || token.length > MAX_TRANSPORT_BYTES * 2) {
    throw new ShareProjectError("This share link has an invalid size.");
  }
  const transport = base64UrlToBytes(token);
  const jsonBytes = await decodeTransport(transport);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(jsonBytes)) as unknown;
  } catch {
    throw new ShareProjectError("The shared project data is damaged.");
  }
  return decodeCompactPayload(value);
}

export function getShareTokenFromHash(hash: string) {
  if (hash.startsWith(SHARE_HASH_PREFIX)) return hash.slice(SHARE_HASH_PREFIX.length);
  if (hash.startsWith(LEGACY_SHARE_HASH_PREFIX)) {
    return hash.slice(LEGACY_SHARE_HASH_PREFIX.length);
  }
  return null;
}

export function buildShareUrl(token: string, currentHref: string) {
  const url = new URL(currentHref);
  url.hash = `${SHARE_HASH_PREFIX.slice(1)}${token}`;
  return url.toString();
}

export function createProjectFileBytes(encoded: EncodedShareProject) {
  const bytes = new Uint8Array(FILE_MAGIC.length + encoded.transport.length);
  bytes.set(FILE_MAGIC);
  bytes.set(encoded.transport, FILE_MAGIC.length);
  return bytes;
}

export async function decodeProjectFile(
  value: ArrayBuffer,
): Promise<DecodedShareProject> {
  const bytes = new Uint8Array(value);
  if (
    bytes.length <= FILE_MAGIC.length ||
    FILE_MAGIC.some((byte, index) => bytes[index] !== byte)
  ) {
    throw new ShareProjectError("This is not a valid Needler project file.");
  }
  const jsonBytes = await decodeTransport(bytes.subarray(FILE_MAGIC.length));
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(jsonBytes)) as unknown;
  } catch {
    throw new ShareProjectError("The Needler project file is damaged.");
  }
  return decodeCompactPayload(payload);
}
