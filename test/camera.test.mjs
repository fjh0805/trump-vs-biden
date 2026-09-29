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
