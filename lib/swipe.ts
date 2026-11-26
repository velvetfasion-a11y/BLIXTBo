/** Shared swipe decisions for the feed deck and the fullscreen mode. */

export const HORIZONTAL_THRESHOLD = 110;
export const DOWN_THRESHOLD = 130;
export const AXIS_SLOP = 8;
export const TAP_SLOP = 12;
/** Fraction of the photo, from each side, that counts as a tap to change image. */
export const PHOTO_EDGE = 0.28;

export type Axis = "x" | "y" | null;

export type Gesture =
  | { type: "yes" }
  | { type: "no" }
  | { type: "down" }
  | { type: "photo"; index: number }
  | { type: "reset" };

export type PhotoRect = { left: number; top: number; width: number; height: number };

/** Same rule the feed deck already uses: only the horizontal distance matters. */
export function decideHorizontal(dx: number, threshold = HORIZONTAL_THRESHOLD): "yes" | "no" | "reset" {
  if (dx > threshold) return "yes";
  if (dx < -threshold) return "no";
  return "reset";
}

export function lockAxis(dx: number, dy: number, current: Axis, slop = AXIS_SLOP): Axis {
  if (current) return current;
  if (Math.hypot(dx, dy) < slop) return null;
  return Math.abs(dy) > Math.abs(dx) ? "y" : "x";
}

export function isTap(dx: number, dy: number, slop = TAP_SLOP) {
  return Math.hypot(dx, dy) <= slop;
}

/** Tap the left or right edge of the photo. A drag is not a tap, so this never runs for apply/skip. */
export function nextPhotoIndex(
  clientX: number,
  clientY: number,
  photo: PhotoRect | null,
  index: number,
  count: number,
  edge = PHOTO_EDGE,
): number | null {
  if (!photo || count <= 1 || photo.width <= 0 || photo.height <= 0) return null;
  if (clientX < photo.left || clientX > photo.left + photo.width) return null;
  if (clientY < photo.top || clientY > photo.top + photo.height) return null;
  const ratio = (clientX - photo.left) / photo.width;
  if (ratio <= edge) {
    const next = index - 1;
    return next < 0 ? null : next;
  }
  if (ratio >= 1 - edge) {
    const next = index + 1;
    return next > count - 1 ? null : next;
  }
  return null;
}

export function gestureOnRelease(input: {
  dx: number;
  dy: number;
  axis: Axis;
  clientX: number;
  clientY: number;
  photo: PhotoRect | null;
  photoIndex: number;
  photoCount: number;
  allowDown?: boolean;
}): Gesture {
  const allowDown = input.allowDown !== false;
  if (allowDown && input.axis === "y") {
    return input.dy > DOWN_THRESHOLD ? { type: "down" } : { type: "reset" };
  }
  if (input.axis === "x" || !allowDown) {
    const horizontal = decideHorizontal(input.dx);
    return horizontal === "reset" ? { type: "reset" } : { type: horizontal };
  }
  if (!isTap(input.dx, input.dy)) return { type: "reset" };
  const next = nextPhotoIndex(input.clientX, input.clientY, input.photo, input.photoIndex, input.photoCount);
  if (next == null) return { type: "reset" };
  return { type: "photo", index: next };
}

/** Only a right swipe applies. Down closes, left skips, a tap only changes the photo. */
export function swipeAction(gesture: Gesture): "apply" | "skip" | "close" | "photo" | "none" {
  if (gesture.type === "yes") return "apply";
  if (gesture.type === "no") return "skip";
  if (gesture.type === "down") return "close";
  if (gesture.type === "photo") return "photo";
  return "none";
}

type FullscreenElement = {
  requestFullscreen?: () => Promise<void> | void;
  webkitRequestFullscreen?: () => void;
};

export function fullscreenApiEnabled(doc: { fullscreenEnabled?: boolean; webkitFullscreenEnabled?: boolean }) {
  return Boolean(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
}

/**
 * Ask for the browser Fullscreen API when it is actually enabled.
 * iOS Safari reports fullscreen as unavailable; callers keep the fixed overlay.
 */
export function requestElementFullscreen(element: FullscreenElement | null, enabled: boolean): "api" | "overlay" {
  if (!element || !enabled) return "overlay";
  const request = element.requestFullscreen
    ? element.requestFullscreen.bind(element)
    : element.webkitRequestFullscreen
      ? element.webkitRequestFullscreen.bind(element)
      : null;
  if (!request) return "overlay";
  try {
    const result = request();
    if (result && typeof (result as Promise<void>).catch === "function") {
      void (result as Promise<void>).catch(() => undefined);
    }
    return "api";
  } catch {
    return "overlay";
  }
}

export function exitDocumentFullscreen(
  doc: {
    fullscreenElement?: unknown;
    webkitFullscreenElement?: unknown;
    exitFullscreen?: () => Promise<void> | void;
    webkitExitFullscreen?: () => void;
  },
  element: unknown,
) {
  const current = doc.fullscreenElement ?? doc.webkitFullscreenElement;
  if (!element || current !== element) return;
  try {
    const exit = doc.exitFullscreen ? doc.exitFullscreen.bind(doc) : doc.webkitExitFullscreen ? doc.webkitExitFullscreen.bind(doc) : null;
    const result = exit?.();
    if (result && typeof (result as Promise<void>).catch === "function") {
      void (result as Promise<void>).catch(() => undefined);
    }
  } catch {
    /* The overlay still closes. */
  }
}
