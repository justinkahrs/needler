import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type {
  PaletteColor,
  PatternPaperSize,
  Project,
  Stitch,
} from "@/app/_lib/needlepointTypes";
import { resolveRoleColorId } from "@/app/_lib/colorways";
import { getVisibleStitches } from "@/app/_lib/layers";

export type PatternPdfProgress = {
  stage: "preparing" | "cover" | "legend" | "charts" | "exceptions" | "saving";
  percent: number;
};

type ChartCell = {
  col: number;
  row: number;
  colorId: string;
  passes: number;
};

type ExceptionStitch = { label: string; stitch: Stitch; colorId: string };

type ChartData = {
  cells: Map<string, ChartCell>;
  exceptions: ExceptionStitch[];
};

const CELLS_PER_PAGE = 42;
const PAGE_COLUMNS = 3;
const PAGE_ROWS = 4;
const SYMBOLS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LETTER_SIZE: [number, number] = [612, 792];
const A4_SIZE: [number, number] = [595.28, 841.89];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseHex(hex: string) {
  const value = hex.replace("#", "");
  return {
    red: Number.parseInt(value.slice(0, 2), 16) / 255,
    green: Number.parseInt(value.slice(2, 4), 16) / 255,
    blue: Number.parseInt(value.slice(4, 6), 16) / 255,
  };
}

function getPageSize(paperSize: PatternPaperSize) {
  return paperSize === "a4" ? A4_SIZE : LETTER_SIZE;
}

function getStitchStrands(stitch: Stitch) {
  return stitch.strands ?? 6;
}

function unitCellForStitch(stitch: Stitch) {
  const colDelta = stitch.to.col - stitch.from.col;
  const rowDelta = stitch.to.row - stitch.from.row;

  if (Math.abs(colDelta) !== 1 || Math.abs(rowDelta) !== 1) {
    return null;
  }

  return {
    col: Math.min(stitch.from.col, stitch.to.col),
    row: Math.min(stitch.from.row, stitch.to.row),
    direction: Math.sign(colDelta) === Math.sign(rowDelta) ? "backslash" : "slash",
  } as const;
}

function buildChartData(project: Project): ChartData {
  const buckets = new Map<
    string,
    Array<{ stitch: Stitch; direction: string; colorId: string }>
  >();
  const exceptions: ExceptionStitch[] = [];

  for (const stitch of getVisibleStitches(project)) {
    const unitCell = unitCellForStitch(stitch);
    const colorId = resolveRoleColorId(project, stitch.colorRoleId);
    if (!unitCell) {
      exceptions.push({ label: "", stitch, colorId });
      continue;
    }

    const key = `${unitCell.col}:${unitCell.row}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push({ stitch, direction: unitCell.direction, colorId });
    buckets.set(key, bucket);
  }

  const cells = new Map<string, ChartCell>();

  for (const [key, bucket] of buckets) {
    const first = bucket[0];
    const isSimple = bucket.every(
      (entry) =>
        entry.colorId === first.colorId &&
        entry.direction === first.direction &&
        getStitchStrands(entry.stitch) === getStitchStrands(first.stitch),
    );

    if (!isSimple) {
      for (const entry of bucket) {
        exceptions.push({ label: "", stitch: entry.stitch, colorId: entry.colorId });
      }
      continue;
    }

    const [col, row] = key.split(":").map(Number);
    cells.set(key, {
      col,
      row,
      colorId: first.colorId,
      passes: bucket.length,
    });
  }

  return {
    cells,
    exceptions: exceptions.map((entry, index) => ({
      ...entry,
      label: `E${index + 1}`,
    })),
  };
}

function getUsedColors(project: Project) {
  const paletteMap = new Map(project.palette.map((color) => [color.id, color]));
  const usage = new Map<
    string,
    { color: PaletteColor; count: number; strands: Set<number> }
  >();

  for (const stitch of getVisibleStitches(project)) {
    const color = paletteMap.get(resolveRoleColorId(project, stitch.colorRoleId));
    if (!color) continue;
    const current = usage.get(color.id) ?? {
      color,
      count: 0,
      strands: new Set<number>(),
    };
    current.count += 1;
    current.strands.add(getStitchStrands(stitch));
    usage.set(color.id, current);
  }

  return [...usage.values()].sort(
    (first, second) =>
      second.count - first.count ||
      (first.color.floss ?? first.color.name).localeCompare(
        second.color.floss ?? second.color.name,
      ),
  );
}

function makeSymbolMap(colorIds: string[]) {
  return new Map(
    colorIds.map((colorId, index) => [
      colorId,
      index < SYMBOLS.length
        ? SYMBOLS[index]
        : `${SYMBOLS[index % SYMBOLS.length]}${Math.floor(index / SYMBOLS.length) + 1}`,
    ]),
  );
}

function drawHeader(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  title: string,
  subtitle: string,
) {
  const { width, height } = page.getSize();
  page.drawText("NEEDLER", {
    x: 42,
    y: height - 42,
    size: 9,
    font: bold,
    color: rgb(0.49, 0.31, 0.21),
  });
  page.drawText(title, {
    x: 42,
    y: height - 68,
    size: 18,
    font: bold,
    color: rgb(0.22, 0.15, 0.11),
  });
  page.drawText(subtitle, {
    x: 42,
    y: height - 85,
    size: 8.5,
    font,
    color: rgb(0.43, 0.34, 0.27),
  });
  page.drawLine({
    start: { x: 42, y: height - 98 },
    end: { x: width - 42, y: height - 98 },
    thickness: 0.7,
    color: rgb(0.81, 0.72, 0.63),
  });
}

function drawCover(
  pdf: PDFDocument,
  pageSize: [number, number],
  project: Project,
  usedColors: ReturnType<typeof getUsedColors>,
  chartData: ChartData,
  font: PDFFont,
  bold: PDFFont,
  previewImage?: Awaited<ReturnType<PDFDocument["embedPng"]>>,
) {
  const page = pdf.addPage(pageSize);
  const { width, height } = page.getSize();
  drawHeader(
    page,
    font,
    bold,
    "Thread Pattern",
    "9 x 12 in perforated paper | 14-count | 126 x 168 stitch cells",
  );

  const previewHeight = Math.min(430, height - 245);
  const previewWidth = previewHeight * 0.75;
  const previewX = 42;
  const previewY = height - 125 - previewHeight;

  page.drawRectangle({
    x: previewX,
    y: previewY,
    width: previewWidth,
    height: previewHeight,
    color: rgb(0.91, 0.79, 0.7),
    borderColor: rgb(0.75, 0.64, 0.54),
    borderWidth: 0.8,
  });
  if (previewImage) {
    page.drawImage(previewImage, {
      x: previewX,
      y: previewY,
      width: previewWidth,
      height: previewHeight,
    });
  }

  const infoX = previewX + previewWidth + 32;
  let infoY = height - 145;
  const infoRows = [
    ["Stitches", getVisibleStitches(project).length.toLocaleString()],
    ["Thread colors", usedColors.length.toString()],
    ["Chart pages", "12"],
    ["Freeform exceptions", chartData.exceptions.length.toString()],
  ];

  for (const [label, value] of infoRows) {
    page.drawText(label.toUpperCase(), {
      x: infoX,
      y: infoY,
      size: 7.5,
      font: bold,
      color: rgb(0.48, 0.39, 0.31),
    });
    page.drawText(value, {
      x: infoX,
      y: infoY - 20,
      size: 19,
      font: bold,
      color: rgb(0.22, 0.15, 0.11),
    });
    infoY -= 58;
  }

  page.drawText("PAGE MAP", {
    x: infoX,
    y: infoY - 4,
    size: 8,
    font: bold,
    color: rgb(0.48, 0.39, 0.31),
  });
  const mapWidth = Math.min(width - infoX - 42, 180);
  const mapCellWidth = mapWidth / PAGE_COLUMNS;
  const mapCellHeight = mapCellWidth * 1.02;
  const mapTop = infoY - 18;

  for (let row = 0; row < PAGE_ROWS; row += 1) {
    for (let col = 0; col < PAGE_COLUMNS; col += 1) {
      const number = row * PAGE_COLUMNS + col + 1;
      const x = infoX + col * mapCellWidth;
      const y = mapTop - (row + 1) * mapCellHeight;
      page.drawRectangle({
        x,
        y,
        width: mapCellWidth,
        height: mapCellHeight,
        borderColor: rgb(0.68, 0.57, 0.47),
        borderWidth: 0.6,
        color: number % 2 ? rgb(0.98, 0.96, 0.92) : rgb(0.94, 0.9, 0.84),
      });
      const label = number.toString();
      page.drawText(label, {
        x: x + mapCellWidth / 2 - bold.widthOfTextAtSize(label, 9) / 2,
        y: y + mapCellHeight / 2 - 3,
        size: 9,
        font: bold,
        color: rgb(0.29, 0.2, 0.15),
      });
    }
  }

  page.drawText(
    "DMC numbers are the color authority. Printed and on-screen swatches are approximate.",
    {
      x: 42,
      y: 46,
      size: 8,
      font,
      color: rgb(0.43, 0.34, 0.27),
    },
  );
}

function drawLegend(
  pdf: PDFDocument,
  pageSize: [number, number],
  usedColors: ReturnType<typeof getUsedColors>,
  symbols: Map<string, string>,
  font: PDFFont,
  bold: PDFFont,
) {
  const page = pdf.addPage(pageSize);
  const { width, height } = page.getSize();
  drawHeader(
    page,
    font,
    bold,
    "Thread Key",
    `${usedColors.length} colors | symbols remain readable when printed in grayscale`,
  );
  const columns = 2;
  const rowsPerColumn = 16;
  const gap = 20;
  const columnWidth = (width - 84 - gap) / columns;
  const rowHeight = Math.min(38, (height - 155) / rowsPerColumn);

  usedColors.slice(0, 32).forEach((usage, index) => {
    const column = Math.floor(index / rowsPerColumn);
    const row = index % rowsPerColumn;
    const x = 42 + column * (columnWidth + gap);
    const y = height - 128 - row * rowHeight;
    const swatch = parseHex(usage.color.hex);
    const symbol = symbols.get(usage.color.id) ?? "?";

    page.drawRectangle({
      x,
      y: y - 19,
      width: 26,
      height: 26,
      color: rgb(swatch.red, swatch.green, swatch.blue),
      borderColor: rgb(0.65, 0.56, 0.48),
      borderWidth: 0.6,
    });
    page.drawText(symbol, {
      x: x + 34,
      y: y - 13,
      size: symbol.length > 1 ? 8 : 11,
      font: bold,
      color: rgb(0.18, 0.14, 0.11),
    });
    page.drawText(
      usage.color.floss ? `DMC ${usage.color.floss}` : "CUSTOM",
      {
        x: x + 54,
        y: y - 5,
        size: 8.5,
        font: bold,
        color: rgb(0.24, 0.17, 0.13),
      },
    );
    const name = usage.color.name.slice(0, 31);
    page.drawText(name, {
      x: x + 54,
      y: y - 17,
      size: 7.4,
      font,
      color: rgb(0.43, 0.34, 0.27),
    });
    const strands = [...usage.strands].sort((a, b) => a - b).join(", ");
    page.drawText(`${usage.count.toLocaleString()} stitches | ${strands} strands`, {
      x: x + 54,
      y: y - 28,
      size: 6.8,
      font,
      color: rgb(0.5, 0.42, 0.35),
    });
  });
}

function chartGeometry(page: PDFPage) {
  const { width, height } = page.getSize();
  const cellSize = Math.min((width - 104) / CELLS_PER_PAGE, (height - 220) / CELLS_PER_PAGE);
  const chartSize = cellSize * CELLS_PER_PAGE;
  return {
    cellSize,
    chartSize,
    x: (width - chartSize) / 2,
    y: 84,
  };
}

function drawChartGrid(
  page: PDFPage,
  font: PDFFont,
  pageCol: number,
  pageRow: number,
) {
  const geometry = chartGeometry(page);
  const startCol = pageCol * CELLS_PER_PAGE;
  const startRow = pageRow * CELLS_PER_PAGE;

  page.drawRectangle({
    x: geometry.x,
    y: geometry.y,
    width: geometry.chartSize,
    height: geometry.chartSize,
    color: rgb(1, 1, 1),
  });

  for (let offset = 0; offset <= CELLS_PER_PAGE; offset += 1) {
    const globalCol = startCol + offset;
    const globalRow = startRow + offset;
    const verticalX = geometry.x + offset * geometry.cellSize;
    const horizontalY = geometry.y + geometry.chartSize - offset * geometry.cellSize;
    page.drawLine({
      start: { x: verticalX, y: geometry.y },
      end: { x: verticalX, y: geometry.y + geometry.chartSize },
      thickness: globalCol % 10 === 0 ? 1.05 : 0.25,
      color: rgb(0.55, 0.5, 0.46),
    });
    page.drawLine({
      start: { x: geometry.x, y: horizontalY },
      end: { x: geometry.x + geometry.chartSize, y: horizontalY },
      thickness: globalRow % 10 === 0 ? 1.05 : 0.25,
      color: rgb(0.55, 0.5, 0.46),
    });

    if (offset < CELLS_PER_PAGE && globalCol % 5 === 0) {
      const label = (globalCol + 1).toString();
      page.drawText(label, {
        x: verticalX + 1,
        y: geometry.y + geometry.chartSize + 4,
        size: 5.5,
        font,
        color: rgb(0.36, 0.31, 0.27),
      });
    }
    if (offset < CELLS_PER_PAGE && globalRow % 5 === 0) {
      const label = (globalRow + 1).toString();
      page.drawText(label, {
        x: geometry.x - font.widthOfTextAtSize(label, 5.5) - 4,
        y: horizontalY - geometry.cellSize + geometry.cellSize / 2 - 2,
        size: 5.5,
        font,
        color: rgb(0.36, 0.31, 0.27),
      });
    }
  }

  return { ...geometry, startCol, startRow };
}

function drawChartPages(
  pdf: PDFDocument,
  pageSize: [number, number],
  chartData: ChartData,
  symbols: Map<string, string>,
  font: PDFFont,
  bold: PDFFont,
) {
  for (let pageRow = 0; pageRow < PAGE_ROWS; pageRow += 1) {
    for (let pageCol = 0; pageCol < PAGE_COLUMNS; pageCol += 1) {
      const pageNumber = pageRow * PAGE_COLUMNS + pageCol + 1;
      const page = pdf.addPage(pageSize);
      drawHeader(
        page,
        font,
        bold,
        `Chart ${pageNumber} of 12`,
        `Cells ${pageCol * 42 + 1}-${pageCol * 42 + 42} across | ${
          pageRow * 42 + 1
        }-${pageRow * 42 + 42} down`,
      );
      const geometry = drawChartGrid(page, font, pageCol, pageRow);

      for (let localRow = 0; localRow < CELLS_PER_PAGE; localRow += 1) {
        for (let localCol = 0; localCol < CELLS_PER_PAGE; localCol += 1) {
          const col = geometry.startCol + localCol;
          const row = geometry.startRow + localRow;
          const cell = chartData.cells.get(`${col}:${row}`);
          if (!cell) continue;
          const symbol = symbols.get(cell.colorId) ?? "?";
          const symbolSize = symbol.length > 1 ? 4.8 : 6.2;
          const symbolWidth = bold.widthOfTextAtSize(symbol, symbolSize);
          const x =
            geometry.x +
            localCol * geometry.cellSize +
            (geometry.cellSize - symbolWidth) / 2;
          const y =
            geometry.y +
            geometry.chartSize -
            (localRow + 1) * geometry.cellSize +
            (geometry.cellSize - symbolSize) / 2 +
            0.7;
          page.drawText(symbol, {
            x,
            y,
            size: symbolSize,
            font: bold,
            color: rgb(0.14, 0.12, 0.1),
          });
          if (cell.passes > 1) {
            const passLabel = `x${cell.passes}`;
            page.drawText(passLabel, {
              x: geometry.x + (localCol + 1) * geometry.cellSize - 5.5,
              y:
                geometry.y +
                geometry.chartSize -
                localRow * geometry.cellSize -
                4,
              size: 3.1,
              font,
              color: rgb(0.45, 0.16, 0.13),
            });
          }
        }
      }
    }
  }
}

function clipLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const checks: Array<[number, number]> = [
    [-dx, x0 - minX],
    [dx, maxX - x0],
    [-dy, y0 - minY],
    [dy, maxY - y0],
  ];

  for (const [p, q] of checks) {
    if (p === 0 && q < 0) return null;
    if (p === 0) continue;
    const ratio = q / p;
    if (p < 0) t0 = Math.max(t0, ratio);
    else t1 = Math.min(t1, ratio);
    if (t0 > t1) return null;
  }

  return {
    from: { x: x0 + t0 * dx, y: y0 + t0 * dy },
    to: { x: x0 + t1 * dx, y: y0 + t1 * dy },
  };
}

function drawExceptionPages(
  pdf: PDFDocument,
  pageSize: [number, number],
  exceptions: ExceptionStitch[],
  font: PDFFont,
  bold: PDFFont,
) {
  if (exceptions.length === 0) return;

  const tablePage = pdf.addPage(pageSize);
  const { height } = tablePage.getSize();
  drawHeader(
    tablePage,
    font,
    bold,
    "Freeform Stitch Index",
    "Coordinates identify exact sheet holes; endpoint maps follow this index.",
  );
  let y = height - 122;
  const rowHeight = 15;
  const rowsPerPage = Math.floor((height - 170) / rowHeight);
  let currentPage = tablePage;

  exceptions.forEach((exception, index) => {
    if (index > 0 && index % rowsPerPage === 0) {
      currentPage = pdf.addPage(pageSize);
      drawHeader(
        currentPage,
        font,
        bold,
        "Freeform Stitch Index",
        "Continued",
      );
      y = currentPage.getHeight() - 122;
    }
    const stitch = exception.stitch;
    currentPage.drawText(exception.label, {
      x: 42,
      y,
      size: 7.5,
      font: bold,
      color: rgb(0.52, 0.18, 0.15),
    });
    currentPage.drawText(
      `(${stitch.from.col}, ${stitch.from.row}) to (${stitch.to.col}, ${
        stitch.to.row
      }) | ${exception.colorId.replace("dmc-", "DMC ")} | ${getStitchStrands(
        stitch,
      )} strands`,
      {
        x: 76,
        y,
        size: 7.2,
        font,
        color: rgb(0.27, 0.21, 0.17),
      },
    );
    y -= rowHeight;
  });

  const relevantPages = new Set<number>();
  for (const exception of exceptions) {
    for (let pageRow = 0; pageRow < PAGE_ROWS; pageRow += 1) {
      for (let pageCol = 0; pageCol < PAGE_COLUMNS; pageCol += 1) {
        const clipped = clipLine(
          exception.stitch.from.col,
          exception.stitch.from.row,
          exception.stitch.to.col,
          exception.stitch.to.row,
          pageCol * CELLS_PER_PAGE,
          pageRow * CELLS_PER_PAGE,
          (pageCol + 1) * CELLS_PER_PAGE,
          (pageRow + 1) * CELLS_PER_PAGE,
        );
        if (clipped) relevantPages.add(pageRow * PAGE_COLUMNS + pageCol);
      }
    }
  }

  for (const pageIndex of relevantPages) {
    const pageCol = pageIndex % PAGE_COLUMNS;
    const pageRow = Math.floor(pageIndex / PAGE_COLUMNS);
    const page = pdf.addPage(pageSize);
    drawHeader(
      page,
      font,
      bold,
      `Endpoint Map ${pageIndex + 1}`,
      "Freeform stitches only; use the index for colors, strands, and exact endpoints.",
    );
    const geometry = drawChartGrid(page, font, pageCol, pageRow);

    for (const exception of exceptions) {
      const clipped = clipLine(
        exception.stitch.from.col,
        exception.stitch.from.row,
        exception.stitch.to.col,
        exception.stitch.to.row,
        geometry.startCol,
        geometry.startRow,
        geometry.startCol + CELLS_PER_PAGE,
        geometry.startRow + CELLS_PER_PAGE,
      );
      if (!clipped) continue;
      const mapPoint = (point: { x: number; y: number }) => ({
        x: geometry.x + (point.x - geometry.startCol) * geometry.cellSize,
        y:
          geometry.y +
          geometry.chartSize -
          (point.y - geometry.startRow) * geometry.cellSize,
      });
      const from = mapPoint(clipped.from);
      const to = mapPoint(clipped.to);
      page.drawLine({
        start: from,
        end: to,
        thickness: 1.35,
        color: rgb(0.63, 0.2, 0.17),
      });
      const labelX = clamp((from.x + to.x) / 2, geometry.x + 2, geometry.x + geometry.chartSize - 18);
      const labelY = clamp((from.y + to.y) / 2 + 2, geometry.y + 2, geometry.y + geometry.chartSize - 8);
      page.drawText(exception.label, {
        x: labelX,
        y: labelY,
        size: 5.5,
        font: bold,
        color: rgb(0.5, 0.12, 0.1),
      });
    }
  }
}

export async function generatePatternPdf(
  project: Project,
  paperSize: PatternPaperSize,
  previewPng?: Uint8Array,
  onProgress?: (progress: PatternPdfProgress) => void,
) {
  onProgress?.({ stage: "preparing", percent: 4 });
  const pdf = await PDFDocument.create();
  pdf.setTitle("Needler Thread Pattern");
  pdf.setAuthor("Needler");
  pdf.setSubject("14-count perforated-paper thread pattern");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize = getPageSize(paperSize);
  const usedColors = getUsedColors(project);
  const symbols = makeSymbolMap(usedColors.map((usage) => usage.color.id));
  const chartData = buildChartData(project);
  const previewImage = previewPng ? await pdf.embedPng(previewPng) : undefined;

  onProgress?.({ stage: "cover", percent: 12 });
  drawCover(pdf, pageSize, project, usedColors, chartData, font, bold, previewImage);
  onProgress?.({ stage: "legend", percent: 21 });
  drawLegend(pdf, pageSize, usedColors, symbols, font, bold);
  onProgress?.({ stage: "charts", percent: 34 });
  drawChartPages(pdf, pageSize, chartData, symbols, font, bold);
  onProgress?.({ stage: "exceptions", percent: 88 });
  drawExceptionPages(pdf, pageSize, chartData.exceptions, font, bold);
  onProgress?.({ stage: "saving", percent: 96 });
  return pdf.save();
}
