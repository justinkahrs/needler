/// <reference lib="webworker" />

import { convertImageToPattern } from "@/app/_lib/patternCore";
import type { PatternConversionInput } from "@/app/_lib/patternCore";

type ConvertMessage = Omit<PatternConversionInput, "rgba"> & {
  type: "convert";
  rgba: ArrayBuffer;
};

self.onmessage = (event: MessageEvent<ConvertMessage>) => {
  const { type, rgba, ...input } = event.data;

  if (type !== "convert") return;

  try {
    const draft = convertImageToPattern(
      { ...input, rgba: new Uint8ClampedArray(rgba) },
      (progress) => self.postMessage({ type: "progress", progress }),
    );

    self.postMessage({ type: "result", draft }, [draft.cells.buffer]);
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Pattern conversion failed.",
    });
  }
};

export {};
