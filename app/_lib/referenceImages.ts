import type { ReferenceTransform } from "@/app/_lib/needlepointTypes";

export type ReferenceImageState = {
  id: string;
  src: string;
  name: string;
  opacity: number;
  width: number | null;
  height: number | null;
  fit: "fit" | "fill";
  transform: ReferenceTransform;
};

export function makeReferenceImageState({
  id,
  src,
  name,
}: {
  id: string;
  src: string;
  name: string;
}): ReferenceImageState {
  return {
    id,
    src,
    name,
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
  };
}

export function getActiveReferenceImage(
  images: ReferenceImageState[],
  activeId: string | null,
) {
  return images.find((image) => image.id === activeId) ?? images[0] ?? null;
}

export function updateReferenceImage(
  images: ReferenceImageState[],
  id: string | null,
  update: (image: ReferenceImageState) => ReferenceImageState,
) {
  if (!id) {
    return images;
  }

  return images.map((image) => (image.id === id ? update(image) : image));
}

export function nextActiveReferenceImageIdAfterRemoval(
  images: ReferenceImageState[],
  removedId: string,
) {
  const removedIndex = images.findIndex((image) => image.id === removedId);

  if (removedIndex === -1) {
    return images[0]?.id ?? null;
  }

  const remaining = images.filter((image) => image.id !== removedId);

  return remaining[removedIndex]?.id ?? remaining[removedIndex - 1]?.id ?? null;
}
