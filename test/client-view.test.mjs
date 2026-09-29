import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

globalThis.localStorage = { getItem: () => null };

const { outputFiles } = await build({
  entryPoints: ["src/client/render.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const { GameView } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`);

test("a rejected send removes the first unacknowledged prediction", () => {
  const view = Object.create(GameView.prototype);
  view.pendingSends = [
    { from: "TX", to: "OK", n: 12, acked: true },
    { from: "TX", to: "AR", n: 1, acked: false },
  ];
  view.paintNumbers = () => {};

  view.revertLastSend();
  assert.deepEqual(view.pendingSends.map((send) => send.to), ["OK"]);
});

test("disconnect clears only local send predictions", () => {
  const view = Object.create(GameView.prototype);
  view.pendingSends = [{ from: "TX", to: "OK", n: 12, acked: false }];
  view.paintNumbers = () => {};

  view.clearPendingSends();
  assert.deepEqual(view.pendingSends, []);
});

test("unchanged snapshots do not restyle states or interrupt their flash", () => {
  const classes = new Set(["flash"]);
  let mutations = 0;
  const path = {
    classList: {
      toggle(name, force) {
        if (classes.has(name) !== force) {
          mutations++;
          if (force) classes.add(name);
          else classes.delete(name);
        }
      },
    },
  };
  const snap = {
    code: "TEST",
    phase: "lobby",
    you: "me",
    mode: "1v1",
    players: [{ id: "me", faction: "trump" }],
    armies: [],
    events: [],
    states: { TX: { visible: true, ownerId: "me", faction: "trump", troops: 12 } },
  };
  const view = Object.create(GameView.prototype);
  Object.assign(view, {
    snap,
    svg: { getElementById: (id) => id === "st-TX" ? path : null },
    streams: new Map(),
    origins: new Set(),
    pendingSends: [],
    selected: null,
    framed: false,
    updateTroopDisplay: () => 12,
    upsertLabel: () => {},
    paintOrigin: () => {},
    paintDragLine: () => {},
    tip: () => {},
  });

  view.render(snap);
  assert.ok(classes.has("trump") && classes.has("mine") && classes.has("flash"));
  mutations = 0;
  view.render(snap);
  assert.equal(mutations, 0);
  assert.ok(classes.has("flash"));
});
