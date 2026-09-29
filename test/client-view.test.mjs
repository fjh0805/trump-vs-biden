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

test("no troops and unexplored target give feedback without losing selection", () => {
  const view = Object.create(GameView.prototype);
  const notices = [];
  Object.assign(view, {
    snap: {
      phase: "playing", you: "me", mode: "1v1", players: [{ id: "me", zone: "west" }],
      states: { TX: { visible: true, ownerId: "me", troops: 0 }, OK: { visible: false } },
    },
    selected: "TX",
    origins: new Set(["TX"]),
    pendingSends: [],
    onNotice: (message) => notices.push(message),
  });
  view.refreshPick = () => {};

  view.dispatchSend("TX", "TX");
  view.snap.states.OK.visible = true;
  view.dispatchSend("TX", "OK");
  assert.match(notices[0], /兵力/);
  view.snap.states.OK.visible = false;
  view.clickState("OK");
  assert.match(notices[1], /尚未侦察/);
  assert.equal(view.selected, "TX");
});

test("drag ending on another owned state collects it without dispatching troops", () => {
  const view = Object.create(GameView.prototype);
  const sends = [];
  Object.assign(view, {
    dragging: true,
    dragMoved: true,
    dragStart: { x: 0, y: 0 },
    lastDragPoint: { x: 50, y: 0 },
    dragCandidate: "OK",
    snap: {
      phase: "playing", you: "me", mode: "1v1", players: [{ id: "me", zone: "west" }],
      states: { TX: { visible: true, ownerId: "me" }, OK: { visible: true, ownerId: "me" } },
    },
    selected: "TX",
    origins: new Set(["TX"]),
    hitState: () => "OK",
    clientToSvg: () => ({ x: 50, y: 0 }),
    refreshPick: () => {},
    dispatchSend: (...args) => sends.push(args),
  });

  view.selectEnd(50, 0);
  assert.deepEqual([...view.origins], ["TX", "OK"]);
  assert.deepEqual(sends, []);
});

test("drag through owned states sends only the visited origins to the target", () => {
  const view = Object.create(GameView.prototype);
  const sends = [];
  Object.assign(view, {
    dragging: true,
    dragMoved: false,
    dragStart: { x: 0, y: 0 },
    lastDragPoint: { x: 0, y: 0 },
    dragCandidate: "TX",
    snap: {
      phase: "playing", you: "me", mode: "1v1", players: [{ id: "me", zone: "west" }],
      states: {
        TX: { visible: true, ownerId: "me" },
        OK: { visible: true, ownerId: "me" },
        CA: { visible: true, ownerId: "me" },
        AR: { visible: true, ownerId: null },
      },
    },
    selected: "TX",
    origins: new Set(["TX"]),
    hitState: (x) => x < 20 ? "TX" : x < 45 ? "OK" : "AR",
    clientToSvg: (x, y) => ({ x, y }),
    refreshPick: () => {},
    dispatchSend: (...args) => sends.push(args),
  });

  view.selectEnd(60, 0);
  assert.deepEqual(sends, [["TX", "AR"], ["OK", "AR"]]);
  assert.ok(!view.origins.has("CA"));
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
