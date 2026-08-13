import { describe, expect, it } from "vitest";
import {
  getActiveReferenceImage,
  makeReferenceImageState,
  nextActiveReferenceImageIdAfterRemoval,
  updateReferenceImage,
} from "@/app/_lib/referenceImages";

function reference(id: string) {
  return makeReferenceImageState({
    id,
    src: `data:image/png;base64,${id}`,
    name: `${id}.png`,
  });
}

describe("reference image helpers", () => {
  it("creates local-only reference image state with default framing", () => {
    const image = reference("first");

    expect(image).toMatchObject({
      id: "first",
      name: "first.png",
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
  });

  it("returns the selected image and falls back to the first image", () => {
    const images = [reference("a"), reference("b")];

    expect(getActiveReferenceImage(images, "b")?.id).toBe("b");
    expect(getActiveReferenceImage(images, "missing")?.id).toBe("a");
    expect(getActiveReferenceImage([], "missing")).toBeNull();
  });

  it("updates only the selected image", () => {
    const images = updateReferenceImage([reference("a"), reference("b")], "b", (image) => ({
      ...image,
      opacity: 0.7,
    }));

    expect(images[0].opacity).toBe(0.42);
    expect(images[1].opacity).toBe(0.7);
  });

  it("chooses a nearby active image after removal", () => {
    const images = [reference("a"), reference("b"), reference("c")];

    expect(nextActiveReferenceImageIdAfterRemoval(images, "b")).toBe("c");
    expect(nextActiveReferenceImageIdAfterRemoval(images, "c")).toBe("b");
    expect(nextActiveReferenceImageIdAfterRemoval([reference("a")], "a")).toBeNull();
  });
});
