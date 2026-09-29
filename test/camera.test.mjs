import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const { outputFiles } = await build({
  entryPoints: ["src/client/camera.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const { MapCamera } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`);

test("portrait map can show all states and refocus after an overview", () => {
  const camera = Object.create(MapCamera.prototype);
  camera.viewport = { clientWidth: 390, clientHeight: 844 };
  camera.world = { style: {} };
  camera.minScale = 1;
  camera.maxScale = 6;
  camera.scale = 1;
  camera.x = 0;
  camera.y = 0;

  camera.fitCover();
  assert.ok(camera.scale > 3);
  camera.fitContain();
  assert.equal(camera.scale, 1);
  assert.equal(camera.x, 0);
  assert.equal(camera.y, 0);
  camera.centerOnSvg(500, 300);
  assert.ok(camera.scale >= camera.coverScale());
  assert.match(camera.world.style.transform, /scale\(/);
});

test("rapid target tap remains a game action while an origin is selected", () => {
  const listeners = new Map();
  globalThis.ResizeObserver = class { observe() {} };
  const viewport = {
    clientWidth: 960,
    clientHeight: 600,
    style: {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener: (name, handler) => listeners.set(name, handler),
  };
  const camera = new MapCamera(viewport, { style: {} });
  const taps = [];
  camera.pointers = new Map([[1, { x: 100, y: 100 }]]);
  camera.pointerStart = new Map([[1, { x: 100, y: 100 }]]);
  camera.lastTap = performance.now() - 100;
  camera.moved = false;
  camera.multitouch = false;
  camera.selecting = false;
  camera.canDoubleTapZoom = () => false;
  camera.onTap = (x, y) => taps.push([x, y]);
  camera.zoomAt = () => assert.fail("target tap must not zoom");

  listeners.get("pointerup")({ pointerId: 1, clientX: 100, clientY: 100, type: "pointerup" });
  assert.deepEqual(taps, [[100, 100]]);
  assert.equal(camera.lastTap, 0);
});

test("cancelled selection does not turn into a send or tap", () => {
  const listeners = new Map();
  globalThis.ResizeObserver = class { observe() {} };
  const viewport = {
    clientWidth: 960, clientHeight: 600, style: {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener: (name, handler) => listeners.set(name, handler),
  };
  const camera = new MapCamera(viewport, { style: {} });
  let cancels = 0;
  camera.selecting = true;
  camera.pointers = new Map([[1, { x: 40, y: 40 }]]);
  camera.pointerStart = new Map([[1, { x: 40, y: 40 }]]);
  camera.onSelectCancel = () => { cancels++; };
  camera.onSelectEnd = () => assert.fail("cancel must not dispatch a send");
  camera.onTap = () => assert.fail("cancel must not dispatch a tap");

  listeners.get("pointercancel")({ pointerId: 1, clientX: 50, clientY: 50, type: "pointercancel" });
  assert.equal(cancels, 1);
  assert.equal(camera.selecting, false);
});
