import { DMC_COLORS } from "@/app/_data/dmcColors";
import type {
  PaletteColor,
  PatternColorUsage,
  PatternDraft,
  PatternProgress,
  PatternSettings,
} from "@/app/_lib/needlepointTypes";

export type Lab = { l: number; a: number; b: number };

export type PatternConversionInput = {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  cols: number;
  rows: number;
  existingPalette: PaletteColor[];
  settings: PatternSettings;
};

type SampledCell = {
  index: number;
  lab: Lab;
};

type WeightedPoint = Lab & { weight: number };

type CandidateColor = {
  color: PaletteColor;
  lab: Lab;
  existing: boolean;
};

const ALPHA_CUTOFF = 0.12;
const EXISTING_COLOR_DELTA_E_ALLOWANCE = 2;
const KMEANS_ITERATIONS = 9;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function srgbChannelToLinear(value: number) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function linearChannelToSrgb(value: number) {
  const normalized =
    value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(clamp(normalized, 0, 1) * 255);
}

function pivotXyz(value: number) {
  return value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
}

export function linearRgbToLab(red: number, green: number, blue: number): Lab {
  const x = (red * 0.4124564 + green * 0.3575761 + blue * 0.1804375) / 0.95047;
  const y = red * 0.2126729 + green * 0.7151522 + blue * 0.072175;
  const z = (red * 0.0193339 + green * 0.119192 + blue * 0.9503041) / 1.08883;
  const fx = pivotXyz(x);
  const fy = pivotXyz(y);
  const fz = pivotXyz(z);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

export function hexToLab(hex: string): Lab {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return linearRgbToLab(
    srgbChannelToLinear(red),
    srgbChannelToLinear(green),
    srgbChannelToLinear(blue),
  );
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function normalizeHue(value: number) {
  return value < 0 ? value + 360 : value;
}

export function deltaE2000(first: Lab, second: Lab) {
  const chroma1 = Math.hypot(first.a, first.b);
  const chroma2 = Math.hypot(second.a, second.b);
  const averageChroma = (chroma1 + chroma2) / 2;
  const averageChroma7 = averageChroma ** 7;
  const g = 0.5 * (1 - Math.sqrt(averageChroma7 / (averageChroma7 + 25 ** 7)));
  const a1Prime = (1 + g) * first.a;
  const a2Prime = (1 + g) * second.a;
  const chroma1Prime = Math.hypot(a1Prime, first.b);
  const chroma2Prime = Math.hypot(a2Prime, second.b);
  const hue1Prime = normalizeHue(radiansToDegrees(Math.atan2(first.b, a1Prime)));
  const hue2Prime = normalizeHue(radiansToDegrees(Math.atan2(second.b, a2Prime)));
  const deltaLightness = second.l - first.l;
  const deltaChroma = chroma2Prime - chroma1Prime;
  const hueDifference = hue2Prime - hue1Prime;
  const deltaHueAngle =
    chroma1Prime * chroma2Prime === 0
      ? 0
      : Math.abs(hueDifference) <= 180
        ? hueDifference
        : hueDifference > 180
          ? hueDifference - 360
          : hueDifference + 360;
  const deltaHue =
    2 *
    Math.sqrt(chroma1Prime * chroma2Prime) *
    Math.sin(degreesToRadians(deltaHueAngle / 2));
  const averageLightnessPrime = (first.l + second.l) / 2;
  const averageChromaPrime = (chroma1Prime + chroma2Prime) / 2;
  const averageHuePrime =
    chroma1Prime * chroma2Prime === 0
      ? hue1Prime + hue2Prime
      : Math.abs(hueDifference) <= 180
        ? (hue1Prime + hue2Prime) / 2
        : hue1Prime + hue2Prime < 360
          ? (hue1Prime + hue2Prime + 360) / 2
          : (hue1Prime + hue2Prime - 360) / 2;
  const t =
    1 -
    0.17 * Math.cos(degreesToRadians(averageHuePrime - 30)) +
    0.24 * Math.cos(degreesToRadians(2 * averageHuePrime)) +
    0.32 * Math.cos(degreesToRadians(3 * averageHuePrime + 6)) -
    0.2 * Math.cos(degreesToRadians(4 * averageHuePrime - 63));
  const lightnessWeight =
    1 +
    (0.015 * (averageLightnessPrime - 50) ** 2) /
      Math.sqrt(20 + (averageLightnessPrime - 50) ** 2);
  const chromaWeight = 1 + 0.045 * averageChromaPrime;
  const hueWeight = 1 + 0.015 * averageChromaPrime * t;
  const rotationDegrees =
    30 * Math.exp(-(((averageHuePrime - 275) / 25) ** 2));
  const chromaPrime7 = averageChromaPrime ** 7;
  const rotation =
    -2 *
    Math.sqrt(chromaPrime7 / (chromaPrime7 + 25 ** 7)) *
    Math.sin(degreesToRadians(2 * rotationDegrees));
  const lightnessTerm = deltaLightness / lightnessWeight;
  const chromaTerm = deltaChroma / chromaWeight;
  const hueTerm = deltaHue / hueWeight;

  return Math.sqrt(
    lightnessTerm ** 2 +
      chromaTerm ** 2 +
      hueTerm ** 2 +
      rotation * chromaTerm * hueTerm,
  );
}

function labDistanceSquared(first: Lab, second: Lab) {
  return (
    (first.l - second.l) ** 2 +
    (first.a - second.a) ** 2 +
    (first.b - second.b) ** 2
  );
}

function sampleCells(input: PatternConversionInput) {
  const samplesX = Math.max(1, Math.floor(input.width / input.cols));
  const samplesY = Math.max(1, Math.floor(input.height / input.rows));
  const sampled: SampledCell[] = [];
  const labs: Array<Lab | null> = Array(input.cols * input.rows).fill(null);
  const histogram = new Map<string, WeightedPoint>();
  const backgroundLab = input.settings.backgroundHex
    ? hexToLab(input.settings.backgroundHex)
    : null;
  let transparentCells = 0;
  let backgroundCells = 0;

  for (let row = 0; row < input.rows; row += 1) {
    for (let col = 0; col < input.cols; col += 1) {
      let alphaTotal = 0;
      let redTotal = 0;
      let greenTotal = 0;
      let blueTotal = 0;

      for (let sampleY = 0; sampleY < samplesY; sampleY += 1) {
        for (let sampleX = 0; sampleX < samplesX; sampleX += 1) {
          const x = col * samplesX + sampleX;
          const y = row * samplesY + sampleY;
          const offset = (y * input.width + x) * 4;
          const alpha = input.rgba[offset + 3] / 255;
          alphaTotal += alpha;
          redTotal += srgbChannelToLinear(input.rgba[offset]) * alpha;
          greenTotal += srgbChannelToLinear(input.rgba[offset + 1]) * alpha;
          blueTotal += srgbChannelToLinear(input.rgba[offset + 2]) * alpha;
        }
      }

      const sampleCount = samplesX * samplesY;
      const averageAlpha = alphaTotal / sampleCount;
      const cellIndex = row * input.cols + col;

      if (averageAlpha < ALPHA_CUTOFF || alphaTotal <= 0) {
        transparentCells += 1;
        continue;
      }

      const redLinear = redTotal / alphaTotal;
      const greenLinear = greenTotal / alphaTotal;
      const blueLinear = blueTotal / alphaTotal;
      const lab = linearRgbToLab(redLinear, greenLinear, blueLinear);

      if (
        backgroundLab &&
        deltaE2000(lab, backgroundLab) <= input.settings.backgroundTolerance
      ) {
        backgroundCells += 1;
        continue;
      }

      labs[cellIndex] = lab;
      sampled.push({ index: cellIndex, lab });

      const red = linearChannelToSrgb(redLinear) >> 3;
      const green = linearChannelToSrgb(greenLinear) >> 3;
      const blue = linearChannelToSrgb(blueLinear) >> 3;
      const key = `${red}:${green}:${blue}`;
      const point = histogram.get(key);

      if (point) {
        const nextWeight = point.weight + 1;
        point.l = (point.l * point.weight + lab.l) / nextWeight;
        point.a = (point.a * point.weight + lab.a) / nextWeight;
        point.b = (point.b * point.weight + lab.b) / nextWeight;
        point.weight = nextWeight;
      } else {
        histogram.set(key, { ...lab, weight: 1 });
      }
    }
  }

  return {
    sampled,
    labs,
    points: [...histogram.values()],
    transparentCells,
    backgroundCells,
  };
}

function weightedMean(points: WeightedPoint[]) {
  let weight = 0;
  let l = 0;
  let a = 0;
  let b = 0;

  for (const point of points) {
    weight += point.weight;
    l += point.l * point.weight;
    a += point.a * point.weight;
    b += point.b * point.weight;
  }

  return { l: l / weight, a: a / weight, b: b / weight };
}

function clusterPoints(points: WeightedPoint[], requestedClusters: number) {
  if (points.length === 0) {
    return [];
  }

  const clusterCount = clamp(Math.round(requestedClusters), 1, points.length);
  const centroids: Lab[] = [weightedMean(points)];

  while (centroids.length < clusterCount) {
    let selected = points[0];
    let selectedScore = -1;

    for (const point of points) {
      const nearest = Math.min(
        ...centroids.map((centroid) => labDistanceSquared(point, centroid)),
      );
      const score = nearest * point.weight;

      if (score > selectedScore) {
        selected = point;
        selectedScore = score;
      }
    }

    centroids.push({ l: selected.l, a: selected.a, b: selected.b });
  }

  for (let iteration = 0; iteration < KMEANS_ITERATIONS; iteration += 1) {
    const totals = centroids.map(() => ({ l: 0, a: 0, b: 0, weight: 0 }));

    for (const point of points) {
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (let index = 0; index < centroids.length; index += 1) {
        const distance = labDistanceSquared(point, centroids[index]);
        if (distance < nearestDistance) {
          nearestIndex = index;
          nearestDistance = distance;
        }
      }

      const total = totals[nearestIndex];
      total.l += point.l * point.weight;
      total.a += point.a * point.weight;
      total.b += point.b * point.weight;
      total.weight += point.weight;
    }

    for (let index = 0; index < centroids.length; index += 1) {
      const total = totals[index];
      if (total.weight > 0) {
        centroids[index] = {
          l: total.l / total.weight,
          a: total.a / total.weight,
          b: total.b / total.weight,
        };
      }
    }
  }

  return centroids;
}

function dmcColorId(floss: string) {
  return `dmc-${floss}`;
}

function makeCandidates(existingPalette: PaletteColor[]) {
  const existingIds = new Set(existingPalette.map((color) => color.id));
  const candidatesById = new Map<string, CandidateColor>();

  for (const color of DMC_COLORS) {
    const paletteColor: PaletteColor = {
      id: dmcColorId(color.floss),
      name: color.name,
      hex: color.hex,
      floss: color.floss,
      source: "dmc",
    };
    candidatesById.set(paletteColor.id, {
      color: paletteColor,
      lab: hexToLab(color.hex),
      existing: existingIds.has(paletteColor.id),
    });
  }

  for (const color of existingPalette) {
    candidatesById.set(color.id, {
      color,
      lab: hexToLab(color.hex),
      existing: true,
    });
  }

  return {
    all: [...candidatesById.values()],
    dmc: [...candidatesById.values()].filter(
      (candidate) => candidate.color.source === "dmc" || candidate.color.floss,
    ),
    existing: [...candidatesById.values()].filter((candidate) => candidate.existing),
  };
}

function findNearest(target: Lab, candidates: CandidateColor[]) {
  let nearest = candidates[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = deltaE2000(target, candidate.lab);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }

  return { candidate: nearest, distance: nearestDistance };
}

function selectPalette(centroids: Lab[], existingPalette: PaletteColor[]) {
  const candidates = makeCandidates(existingPalette);
  const selected = new Map<string, CandidateColor>();

  for (const centroid of centroids) {
    const nearestDmc = findNearest(centroid, candidates.dmc);
    const nearestExisting = candidates.existing.length
      ? findNearest(centroid, candidates.existing)
      : null;
    const choice =
      nearestExisting &&
      nearestExisting.distance <= nearestDmc.distance + EXISTING_COLOR_DELTA_E_ALLOWANCE
        ? nearestExisting.candidate
        : nearestDmc.candidate;

    selected.set(choice.color.id, choice);
  }

  return [...selected.values()];
}

function assignCells(
  sampled: SampledCell[],
  totalCells: number,
  palette: CandidateColor[],
) {
  const cells = new Uint16Array(totalCells);

  for (const cell of sampled) {
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < palette.length; index += 1) {
      const distance = deltaE2000(cell.lab, palette[index].lab);
      if (distance < nearestDistance) {
        nearestIndex = index;
        nearestDistance = distance;
      }
    }

    cells[cell.index] = nearestIndex + 1;
  }

  return cells;
}

function orthogonalNeighbors(index: number, cols: number, rows: number) {
  const col = index % cols;
  const row = Math.floor(index / cols);
  const neighbors: number[] = [];

  if (col > 0) neighbors.push(index - 1);
  if (col + 1 < cols) neighbors.push(index + 1);
  if (row > 0) neighbors.push(index - cols);
  if (row + 1 < rows) neighbors.push(index + cols);
  return neighbors;
}

function chooseNeighborColor(
  index: number,
  cells: Uint16Array,
  labs: Array<Lab | null>,
  palette: CandidateColor[],
  cols: number,
  rows: number,
) {
  const sourceLab = labs[index];
  if (!sourceLab) return 0;

  const options = new Set(
    orthogonalNeighbors(index, cols, rows)
      .map((neighbor) => cells[neighbor])
      .filter((color) => color > 0 && color !== cells[index]),
  );
  let selected = 0;
  let selectedDistance = Number.POSITIVE_INFINITY;

  for (const option of options) {
    const distance = deltaE2000(sourceLab, palette[option - 1].lab);
    if (distance < selectedDistance) {
      selected = option;
      selectedDistance = distance;
    }
  }

  return selected;
}

function removeIsolatedCells(
  cells: Uint16Array,
  labs: Array<Lab | null>,
  palette: CandidateColor[],
  cols: number,
  rows: number,
) {
  const next = cells.slice();
  let changed = 0;

  for (let index = 0; index < cells.length; index += 1) {
    const color = cells[index];
    if (color === 0) continue;
    const hasMatch = orthogonalNeighbors(index, cols, rows).some(
      (neighbor) => cells[neighbor] === color,
    );

    if (!hasMatch) {
      const replacement = chooseNeighborColor(
        index,
        cells,
        labs,
        palette,
        cols,
        rows,
      );
      if (replacement > 0) {
        next[index] = replacement;
        changed += 1;
      }
    }
  }

  return { cells: next, changed };
}

function removeSmallRegions(
  cells: Uint16Array,
  labs: Array<Lab | null>,
  palette: CandidateColor[],
  cols: number,
  rows: number,
) {
  const next = cells.slice();
  const visited = new Uint8Array(cells.length);
  let changed = 0;

  for (let start = 0; start < cells.length; start += 1) {
    const color = cells[start];
    if (color === 0 || visited[start]) continue;

    const region: number[] = [];
    const queue = [start];
    visited[start] = 1;

    while (queue.length) {
      const current = queue.pop()!;
      region.push(current);
      for (const neighbor of orthogonalNeighbors(current, cols, rows)) {
        if (!visited[neighbor] && cells[neighbor] === color) {
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }

    if (region.length > 3) continue;

    const replacementScores = new Map<number, number>();
    for (const index of region) {
      const sourceLab = labs[index];
      if (!sourceLab) continue;
      for (const neighbor of orthogonalNeighbors(index, cols, rows)) {
        const neighborColor = cells[neighbor];
        if (neighborColor === 0 || neighborColor === color) continue;
        const score = deltaE2000(sourceLab, palette[neighborColor - 1].lab);
        replacementScores.set(
          neighborColor,
          (replacementScores.get(neighborColor) ?? 0) + score,
        );
      }
    }

    const replacement = [...replacementScores.entries()].sort(
      (first, second) => first[1] - second[1] || first[0] - second[0],
    )[0]?.[0];

    if (replacement) {
      for (const index of region) next[index] = replacement;
      changed += region.length;
    }
  }

  return { cells: next, changed };
}

function compactPalette(cells: Uint16Array, palette: CandidateColor[]) {
  const counts = new Map<number, number>();
  for (const value of cells) {
    if (value > 0) counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const used = [...counts.keys()].sort((first, second) => first - second);
  const remap = new Map(used.map((value, index) => [value, index + 1]));
  const compactCells = cells.map((value) => (value === 0 ? 0 : remap.get(value) ?? 0));
  const colors: PatternColorUsage[] = used.map((value) => ({
    color: palette[value - 1].color,
    count: counts.get(value) ?? 0,
    existing: palette[value - 1].existing,
  }));

  return { cells: compactCells, colors };
}

export function convertImageToPattern(
  input: PatternConversionInput,
  onProgress?: (progress: PatternProgress) => void,
): PatternDraft {
  onProgress?.({ stage: "sampling", percent: 8 });
  const sample = sampleCells(input);
  onProgress?.({ stage: "clustering", percent: 34 });

  if (sample.sampled.length === 0) {
    return {
      cols: input.cols,
      rows: input.rows,
      cells: new Uint16Array(input.cols * input.rows),
      colors: [],
      stats: {
        totalCells: input.cols * input.rows,
        stitchedCells: 0,
        transparentCells: sample.transparentCells,
        backgroundCells: sample.backgroundCells,
        simplifiedCells: 0,
      },
      settings: input.settings,
    };
  }

  const centroids = clusterPoints(
    sample.points,
    clamp(input.settings.maxColors, 2, 32),
  );
  onProgress?.({ stage: "matching", percent: 68 });
  const selectedPalette = selectPalette(centroids, input.existingPalette);
  let cells = assignCells(
    sample.sampled,
    input.cols * input.rows,
    selectedPalette,
  );
  let simplifiedCells = 0;

  onProgress?.({ stage: "cleaning", percent: 88 });
  if (input.settings.detail !== "high") {
    const isolated = removeIsolatedCells(
      cells,
      sample.labs,
      selectedPalette,
      input.cols,
      input.rows,
    );
    cells = isolated.cells;
    simplifiedCells += isolated.changed;
  }

  if (input.settings.detail === "low") {
    const regions = removeSmallRegions(
      cells,
      sample.labs,
      selectedPalette,
      input.cols,
      input.rows,
    );
    cells = regions.cells;
    simplifiedCells += regions.changed;
  }

  const compact = compactPalette(cells, selectedPalette);
  onProgress?.({ stage: "complete", percent: 100 });

  return {
    cols: input.cols,
    rows: input.rows,
    cells: compact.cells,
    colors: compact.colors,
    stats: {
      totalCells: input.cols * input.rows,
      stitchedCells: sample.sampled.length,
      transparentCells: sample.transparentCells,
      backgroundCells: sample.backgroundCells,
      simplifiedCells,
    },
    settings: input.settings,
  };
}
