/// <reference lib="webworker" />

import { generatePatternPdf } from "@/app/_lib/patternPdf";
import type { PatternPaperSize, Project } from "@/app/_lib/needlepointTypes";

type PdfMessage = {
  type: "generate";
  project: Project;
  paperSize: PatternPaperSize;
  previewPng?: ArrayBuffer;
};

self.onmessage = async (event: MessageEvent<PdfMessage>) => {
  if (event.data.type !== "generate") return;

  try {
    const bytes = await generatePatternPdf(
      event.data.project,
      event.data.paperSize,
      event.data.previewPng ? new Uint8Array(event.data.previewPng) : undefined,
      (progress) => self.postMessage({ type: "progress", progress }),
    );
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    self.postMessage({ type: "result", buffer }, [buffer]);
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "PDF export failed.",
    });
  }
};

export {};
