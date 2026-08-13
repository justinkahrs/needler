export type GesturePoint = { x: number; y: number };

export type GestureViewState = {
  zoom: number;
  pan: GesturePoint;
  rotation: number;
};

export type GestureFrame = {
  first: GesturePoint;
  second: GesturePoint;
  centroid: GesturePoint;
  distance: number;
  angle: number;
};

export type ReferenceGestureIntent = "pending" | "image-scale" | "viewport";

const MIN_GESTURE_DISTANCE = 1;

export function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clampZoom(value: number, min: number, max: number) {
  return clampValue(value, min, max);
}

export function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

export function radiansToDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

export function normalizeViewRotation(degrees: number) {
  const normalized = ((degrees % 360) + 360) % 360;

  return normalized > 180 ? normalized - 360 : normalized;
}

export function distanceBetween(a: GesturePoint, b: GesturePoint) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function midpoint(a: GesturePoint, b: GesturePoint): GesturePoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export function getGestureFrame(
  first: GesturePoint,
  second: GesturePoint,
): GestureFrame {
  return {
    first,
    second,
    centroid: midpoint(first, second),
    distance: Math.max(MIN_GESTURE_DISTANCE, distanceBetween(first, second)),
    angle: Math.atan2(second.y - first.y, second.x - first.x),
  };
}

export function screenToWorldPoint(
  point: GesturePoint,
  view: GestureViewState,
  center: GesturePoint,
): GesturePoint {
  const radians = degreesToRadians(-view.rotation);
  const dx = point.x - view.pan.x;
  const dy = point.y - view.pan.y;
  const rotatedX = dx * Math.cos(radians) - dy * Math.sin(radians);
  const rotatedY = dx * Math.sin(radians) + dy * Math.cos(radians);

  return {
    x: rotatedX / view.zoom + center.x,
    y: rotatedY / view.zoom + center.y,
  };
}

export function worldToScreenPoint(
  point: GesturePoint,
  view: GestureViewState,
  center: GesturePoint,
): GesturePoint {
  const radians = degreesToRadians(view.rotation);
  const dx = (point.x - center.x) * view.zoom;
  const dy = (point.y - center.y) * view.zoom;

  return {
    x: view.pan.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: view.pan.y + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

export function zoomViewAtPoint({
  view,
  screenPoint,
  nextZoom,
  center,
  minZoom,
  maxZoom,
}: {
  view: GestureViewState;
  screenPoint: GesturePoint;
  nextZoom: number;
  center: GesturePoint;
  minZoom: number;
  maxZoom: number;
}): GestureViewState {
  const zoom = clampZoom(nextZoom, minZoom, maxZoom);
  const worldPoint = screenToWorldPoint(screenPoint, view, center);
  const nextView = { ...view, zoom };
  const nextScreenPoint = worldToScreenPoint(worldPoint, nextView, center);

  return {
    ...nextView,
    pan: {
      x: view.pan.x + screenPoint.x - nextScreenPoint.x,
      y: view.pan.y + screenPoint.y - nextScreenPoint.y,
    },
  };
}

export function applyViewportGesture({
  startView,
  startFrame,
  currentFrame,
  center,
  minZoom,
  maxZoom,
}: {
  startView: GestureViewState;
  startFrame: GestureFrame;
  currentFrame: GestureFrame;
  center: GesturePoint;
  minZoom: number;
  maxZoom: number;
}): GestureViewState {
  const worldPoint = screenToWorldPoint(startFrame.centroid, startView, center);
  const zoom = clampZoom(
    startView.zoom * (currentFrame.distance / startFrame.distance),
    minZoom,
    maxZoom,
  );
  const rotation = normalizeViewRotation(
    startView.rotation +
      radiansToDegrees(currentFrame.angle - startFrame.angle),
  );
  const nextView = { ...startView, zoom, rotation };
  const nextScreenPoint = worldToScreenPoint(worldPoint, nextView, center);

  return {
    ...nextView,
    pan: {
      x: startView.pan.x + currentFrame.centroid.x - nextScreenPoint.x,
      y: startView.pan.y + currentFrame.centroid.y - nextScreenPoint.y,
    },
  };
}

export function getDoubleTapView({
  view,
  screenPoint,
  center,
  fitView,
  workingZoom,
  minZoom,
  maxZoom,
}: {
  view: GestureViewState;
  screenPoint: GesturePoint;
  center: GesturePoint;
  fitView: GestureViewState;
  workingZoom: number;
  minZoom: number;
  maxZoom: number;
}): GestureViewState {
  const targetZoom = clampZoom(workingZoom, minZoom, maxZoom);

  if (view.zoom >= targetZoom * 0.9) {
    return fitView;
  }

  return zoomViewAtPoint({
    view,
    screenPoint,
    nextZoom: targetZoom,
    center,
    minZoom,
    maxZoom,
  });
}

export function classifyReferenceGesture({
  startFrame,
  currentFrame,
  scaleThreshold = 0.045,
  translationThreshold = 12,
  rotationThreshold = 6,
}: {
  startFrame: GestureFrame;
  currentFrame: GestureFrame;
  scaleThreshold?: number;
  translationThreshold?: number;
  rotationThreshold?: number;
}): ReferenceGestureIntent {
  const scaleChange = Math.abs(currentFrame.distance / startFrame.distance - 1);
  const translation = distanceBetween(startFrame.centroid, currentFrame.centroid);
  const rotation = Math.abs(
    normalizeViewRotation(
      radiansToDegrees(currentFrame.angle - startFrame.angle),
    ),
  );

  if (
    scaleChange < scaleThreshold &&
    translation < translationThreshold &&
    rotation < rotationThreshold
  ) {
    return "pending";
  }

  if (
    scaleChange >= scaleThreshold &&
    scaleChange * 250 >= translation &&
    scaleChange * 80 >= rotation
  ) {
    return "image-scale";
  }

  return "viewport";
}
