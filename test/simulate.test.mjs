import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { build } from "esbuild";

const { outputFiles } = await build({
  entryPoints: ["worker/simulate.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const { emptyTerritories, step } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`);

function match() {
  const territories = emptyTerritories();
  territories.TX = { ownerId: "red", troops: 12, startTroops: 12 };
  territories.OK = { ownerId: "blue", troops: 1, startTroops: 1 };
  return {
    phase: "playing", mode: "1v1", tick: 0, startedAt: Date.now(),
    players: [
      { id: "red", faction: "trump", home: "TX", isAI: false },
      { id: "blue", faction: "biden", home: "CA", isAI: false },
    ],
    territories, armies: [], armySeq: 1,
  };
}

function army(id, ownerId, faction, from, to, troops) {
  return { id, ownerId, faction, from, to, troops, progress: 1, speed: 0, x: 0, y: 0, arrived: true };
}

test("a mutual siege wipeout leaves the defender in control", () => {
  const state = match();
  state.territories.OK.troops = 0.95; // One defender after this tick's production.
  state.armies.push(army("a1", "red", "trump", "TX", "OK", 1));

  const events = step(state);
  assert.equal(state.territories.OK.ownerId, "blue");
  assert.equal(state.territories.OK.troops, 1);
  assert.equal(state.armies.length, 0);
  assert.ok(!events.some((event) => event.kind === "capture"));
});

test("a surviving attacker captures the state with their remaining troops", () => {
  const state = match();
  state.territories.OK.troops = 0.95;
  state.armies.push(army("a1", "red", "trump", "TX", "OK", 2));

  const events = step(state);
  assert.equal(state.territories.OK.ownerId, "red");
  assert.equal(state.territories.OK.troops, 1);
  assert.equal(state.armies.length, 0);
  assert.equal(events.filter((event) => event.kind === "capture").length, 1);
});

test("large field clashes resolve faster than one soldier per strike", () => {
  const state = match();
  const map = JSON.parse(readFileSync("src/shared/us-map.json", "utf8"));
  const from = map.states.TX;
  const to = map.states.OK;
  const midpoint = { x: (from.cx + to.cx) / 2, y: (from.cy + to.cy) / 2 };
  const red = { ...army("a1", "red", "trump", "TX", "OK", 40), ...midpoint, progress: 0.5, arrived: false };
  const blue = { ...army("a2", "blue", "biden", "OK", "TX", 40), ...midpoint, progress: 0.5, arrived: false };
  state.armies.push(red, blue);

  step(state);
  step(state);
  const events = step(state);
  assert.ok(events.some((event) => event.kind === "clash"));
  assert.ok(red.troops <= 33 && blue.troops <= 33);
});
