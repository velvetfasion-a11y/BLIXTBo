import assert from "node:assert/strict";
import test from "node:test";
import {
  DOWN_THRESHOLD,
  HORIZONTAL_THRESHOLD,
  decideHorizontal,
  exitDocumentFullscreen,
  fullscreenApiEnabled,
  gestureOnRelease,
  lockAxis,
  nextPhotoIndex,
  requestElementFullscreen,
  swipeAction,
} from "../lib/swipe.ts";

const photo = { left: 0, top: 0, width: 390, height: 560 };

test("the feed deck still commits only past the horizontal threshold", () => {
  assert.equal(HORIZONTAL_THRESHOLD, 110);
  assert.equal(decideHorizontal(110), "reset");
  assert.equal(decideHorizontal(111), "yes");
  assert.equal(decideHorizontal(-110), "reset");
  assert.equal(decideHorizontal(-111), "no");
  assert.equal(decideHorizontal(0), "reset");
});

test("a vertical drag locks to down and never becomes an application", () => {
  assert.equal(lockAxis(20, 40, null), "y");
  assert.equal(lockAxis(40, 20, null), "x");
  assert.equal(lockAxis(4, 4, null), null);
  assert.equal(lockAxis(80, 10, "y"), "y");

  const down = gestureOnRelease({
    dx: 90,
    dy: DOWN_THRESHOLD + 1,
    axis: "y",
    clientX: 300,
    clientY: 400,
    photo,
    photoIndex: 0,
    photoCount: 3,
  });
  assert.deepEqual(down, { type: "down" });
  assert.equal(swipeAction(down), "close");
  assert.notEqual(swipeAction(down), "apply");

  const short = gestureOnRelease({
    dx: 0,
    dy: DOWN_THRESHOLD,
    axis: "y",
    clientX: 200,
    clientY: 400,
    photo,
    photoIndex: 0,
    photoCount: 3,
  });
  assert.equal(short.type, "reset");
  assert.equal(swipeAction(short), "none");
});

test("a horizontal swipe applies or skips and does not change the photo", () => {
  const yes = gestureOnRelease({
    dx: 180,
    dy: 24,
    axis: "x",
    clientX: photo.width - 10,
    clientY: 200,
    photo,
    photoIndex: 0,
    photoCount: 3,
  });
  assert.deepEqual(yes, { type: "yes" });
  assert.equal(swipeAction(yes), "apply");

  const no = gestureOnRelease({
    dx: -180,
    dy: 30,
    axis: "x",
    clientX: 12,
    clientY: 200,
    photo,
    photoIndex: 1,
    photoCount: 3,
  });
  assert.deepEqual(no, { type: "no" });
  assert.equal(swipeAction(no), "skip");

  const nudge = gestureOnRelease({
    dx: 40,
    dy: 4,
    axis: "x",
    clientX: photo.width - 8,
    clientY: 180,
    photo,
    photoIndex: 0,
    photoCount: 3,
  });
  assert.equal(nudge.type, "reset");
  assert.equal(swipeAction(nudge), "none");
});

test("a tap on the photo edge changes the image and never applies", () => {
  const next = gestureOnRelease({
    dx: 2,
    dy: 1,
    axis: null,
    clientX: photo.width - 20,
    clientY: 240,
    photo,
    photoIndex: 0,
    photoCount: 3,
  });
  assert.deepEqual(next, { type: "photo", index: 1 });
  assert.equal(swipeAction(next), "photo");

  const prev = nextPhotoIndex(20, 240, photo, 1, 3);
  assert.equal(prev, 0);
  assert.equal(nextPhotoIndex(photo.width / 2, 240, photo, 0, 3), null);
  assert.equal(nextPhotoIndex(photo.width - 10, 240, photo, 2, 3), null);
  assert.equal(nextPhotoIndex(20, 240, photo, 0, 1), null);
  assert.equal(nextPhotoIndex(20, 800, photo, 0, 3), null);
});

test("fullscreen is requested only when the browser enables it", async () => {
  assert.equal(fullscreenApiEnabled({}), false);
  assert.equal(fullscreenApiEnabled({ fullscreenEnabled: false }), false);
  assert.equal(fullscreenApiEnabled({ webkitFullscreenEnabled: true }), true);

  let called = false;
  const element = {
    requestFullscreen() {
      called = true;
      return Promise.resolve();
    },
  };
  assert.equal(requestElementFullscreen(element, false), "overlay");
  assert.equal(called, false);
  assert.equal(requestElementFullscreen(null, true), "overlay");
  assert.equal(requestElementFullscreen(element, true), "api");
  assert.equal(called, true);

  const rejected = {
    requestFullscreen() {
      return Promise.reject(new Error("not allowed"));
    },
  };
  assert.equal(requestElementFullscreen(rejected, true), "api");
  await new Promise((resolve) => setTimeout(resolve, 0));

  const throwing = {
    requestFullscreen() {
      throw new Error("missing");
    },
  };
  assert.equal(requestElementFullscreen(throwing, true), "overlay");

  let webkit = false;
  assert.equal(
    requestElementFullscreen(
      {
        webkitRequestFullscreen() {
          webkit = true;
        },
      },
      true,
    ),
    "api",
  );
  assert.equal(webkit, true);
});

test("leaving fullscreen only exits when this element is the fullscreen element", () => {
  let exited = false;
  const element = { id: "overlay" };
  exitDocumentFullscreen(
    {
      fullscreenElement: null,
      exitFullscreen() {
        exited = true;
      },
    },
    element,
  );
  assert.equal(exited, false);

  exitDocumentFullscreen(
    {
      fullscreenElement: element,
      exitFullscreen() {
        exited = true;
        return Promise.resolve();
      },
    },
    element,
  );
  assert.equal(exited, true);
});
