import { describe, expect, it } from "vitest";
import {
  applyViewportGesture,
  classifyReferenceGesture,
  getDoubleTapView,
  getGestureFrame,
  normalizeViewRotation,
  screenToWorldPoint,
  zoomViewAtPoint,
} from "@/app/_lib/gestureView";
import type { GesturePoint, GestureViewState } from "@/app/_lib/gestureView";

const center: GesturePoint = { x: 500, y: 400 };
const baseView: GestureViewState = {
  zoom: 1,
  pan: { x: 250, y: 220 },
  rotation: 0,
};

function expectPointClose(actual: GesturePoint, expected: GesturePoint) {
  expect(actual.x).toBeCloseTo(expected.x, 5);
  expect(actual.y).toBeCloseTo(expected.y, 5);
}

describe("gesture viewport math", () => {
  it("preserves a zoom focal point", () => {
    const point = { x: 320, y: 260 };
    const worldBefore = screenToWorldPoint(point, baseView, center);
    const nextView = zoomViewAtPoint({
      view: baseView,
      screenPoint: point,
      nextZoom: 2,
      center,
      minZoom: 0.1,
      maxZoom: 4,
    });

    expect(nextView.zoom).toBe(2);
    expectPointClose(screenToWorldPoint(point, nextView, center), worldBefore);
  });

  it("applies pinch zoom around the current centroid", () => {
    const startFrame = getGestureFrame({ x: 280, y: 240 }, { x: 360, y: 240 });
    const currentFrame = getGestureFrame({ x: 260, y: 240 }, { x: 380, y: 240 });
    const worldBefore = screenToWorldPoint(startFrame.centroid, baseView, center);
    const nextView = applyViewportGesture({
      startView: baseView,
      startFrame,
      currentFrame,
      center,
      minZoom: 0.1,
      maxZoom: 4,
    });

    expect(nextView.zoom).toBeCloseTo(1.5);
    expectPointClose(
      screenToWorldPoint(currentFrame.centroid, nextView, center),
      worldBefore,
    );
  });

  it("applies two-pointer pan from centroid movement", () => {
    const startFrame = getGestureFrame({ x: 280, y: 240 }, { x: 360, y: 240 });
    const currentFrame = getGestureFrame({ x: 300, y: 270 }, { x: 380, y: 270 });
    const nextView = applyViewportGesture({
      startView: baseView,
      startFrame,
      currentFrame,
      center,
      minZoom: 0.1,
      maxZoom: 4,
    });

    expect(nextView.zoom).toBeCloseTo(baseView.zoom);
    expect(nextView.rotation).toBeCloseTo(baseView.rotation);
    expect(nextView.pan.x - baseView.pan.x).toBeCloseTo(20);
    expect(nextView.pan.y - baseView.pan.y).toBeCloseTo(30);
  });

  it("applies two-pointer rotation and normalizes the result", () => {
    const startFrame = getGestureFrame({ x: 300, y: 300 }, { x: 380, y: 300 });
    const currentFrame = getGestureFrame({ x: 340, y: 260 }, { x: 340, y: 340 });
    const nextView = applyViewportGesture({
      startView: { ...baseView, rotation: 140 },
      startFrame,
      currentFrame,
      center,
      minZoom: 0.1,
      maxZoom: 4,
    });

    expect(nextView.rotation).toBe(-130);
    expect(normalizeViewRotation(540)).toBe(180);
    expect(normalizeViewRotation(181)).toBe(-179);
  });

  it("clamps gesture zoom to configured bounds", () => {
    const startFrame = getGestureFrame({ x: 300, y: 300 }, { x: 301, y: 300 });
    const currentFrame = getGestureFrame({ x: 240, y: 300 }, { x: 420, y: 300 });
    const nextView = applyViewportGesture({
      startView: baseView,
      startFrame,
      currentFrame,
      center,
      minZoom: 0.2,
      maxZoom: 2.5,
    });

    expect(nextView.zoom).toBe(2.5);
  });

  it("double tap zooms to a working view, then refits", () => {
    const fitView: GestureViewState = {
      zoom: 0.4,
      pan: { x: 200, y: 300 },
      rotation: 0,
    };
    const point = { x: 350, y: 260 };
    const worldBefore = screenToWorldPoint(point, fitView, center);
    const focused = getDoubleTapView({
      view: fitView,
      screenPoint: point,
      center,
      fitView,
      workingZoom: 1.2,
      minZoom: 0.1,
      maxZoom: 4,
    });

    expect(focused.zoom).toBe(1.2);
    expectPointClose(screenToWorldPoint(point, focused, center), worldBefore);

    const refit = getDoubleTapView({
      view: focused,
      screenPoint: point,
      center,
      fitView,
      workingZoom: 1.2,
      minZoom: 0.1,
      maxZoom: 4,
    });

    expect(refit).toEqual(fitView);
  });
});

describe("reference image gesture classification", () => {
  it("classifies pinch-dominant motion as image scaling", () => {
    const startFrame = getGestureFrame({ x: 100, y: 100 }, { x: 200, y: 100 });
    const currentFrame = getGestureFrame({ x: 80, y: 100 }, { x: 220, y: 100 });

    expect(classifyReferenceGesture({ startFrame, currentFrame })).toBe(
      "image-scale",
    );
  });

  it("classifies translation-dominant motion as viewport movement", () => {
    const startFrame = getGestureFrame({ x: 100, y: 100 }, { x: 200, y: 100 });
    const currentFrame = getGestureFrame({ x: 130, y: 140 }, { x: 230, y: 140 });

    expect(classifyReferenceGesture({ startFrame, currentFrame })).toBe(
      "viewport",
    );
  });

  it("waits while motion is below intent thresholds", () => {
    const startFrame = getGestureFrame({ x: 100, y: 100 }, { x: 200, y: 100 });
    const currentFrame = getGestureFrame({ x: 102, y: 101 }, { x: 202, y: 101 });

    expect(classifyReferenceGesture({ startFrame, currentFrame })).toBe(
      "pending",
    );
  });
});
