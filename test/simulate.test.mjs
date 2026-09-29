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
const { aiContext, canSendTo, emptyTerritories, seedMatch, step } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`);
const { outputFiles: policyFiles } = await build({
  entryPoints: ["src/shared/ai-policy.ts"], bundle: true, format: "esm", platform: "node", write: false,
});
const { decideAiOrders } = await import(`data:text/javascript;base64,${Buffer.from(policyFiles[0].contents).toString("base64")}`);

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
  assert.equal(state.phase, "ended");
  assert.equal(state.winner, "trump");
  assert.match(state.reason, /领土与部队全部失去/);
});

test("the last territory falling ends the match without waiting for the clock", () => {
  const state = match();
  state.territories.OK.troops = 0.95;
  state.armies.push(army("a1", "red", "trump", "TX", "OK", 2));
  step(state);
  assert.equal(state.tick, 1);
  assert.equal(state.phase, "ended");
  assert.equal(state.winner, "trump");
  assert.ok(state.endedAt > 0);
  const tick = state.tick;
  assert.deepEqual(step(state), []);
  assert.equal(state.tick, tick);
});

test("a faction with no territory but a surviving army can still counterattack", () => {
  const state = match();
  state.territories.OK.troops = 0.95;
  state.armies.push(army("a1", "red", "trump", "TX", "OK", 2));
  const blue = army("a2", "blue", "biden", "OK", "TX", 2);
  blue.progress = 0;
  blue.arrived = false;
  state.armies.push(blue);
  step(state);
  assert.equal(state.territories.OK.ownerId, "red");
  assert.equal(state.phase, "playing");
  assert.equal(state.winner, undefined);

  blue.progress = 0.99;
  blue.speed = 0.01;
  for (let i = 0; i < 10 && state.phase === "playing"; i++) step(state);
  assert.equal(state.phase, "ended");
  assert.equal(state.winner, "trump");
});

test("a 2v2 teammate's territory prevents premature elimination", () => {
  const state = match();
  state.mode = "2v2";
  state.players.push({ id: "mate", faction: "biden", home: "NY", isAI: false });
  state.territories.NY = { ownerId: "mate", troops: 12, startTroops: 12 };
  state.territories.OK.troops = 0.95;
  state.armies.push(army("a1", "red", "trump", "TX", "OK", 2));

  step(state);
  assert.equal(state.territories.OK.ownerId, "red");
  assert.equal(state.phase, "playing");
});

test("both eliminated armies and territories produce a draw", () => {
  const state = match();
  state.territories.TX.ownerId = null;
  state.territories.OK.ownerId = null;
  step(state);
  assert.equal(state.phase, "ended");
  assert.equal(state.winner, "draw");
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

test("AI selects a visible, executable opening instead of a distant neutral state", () => {
  const state = match();
  state.players[0].isAI = true;
  seedMatch(state);
  const context = aiContext(state, "red");
  const orders = decideAiOrders(context);
  assert.ok(orders.length > 0);
  assert.ok(orders.every((order) => context.visibleTargets.has(order.to)));
  assert.ok(orders.every((order) => canSendTo(state, "red", order.from, order.to)));
});

test("AI keeps issuing attacks and conquering after its opening send", () => {
  const state = match();
  state.players[0].isAI = true;
  seedMatch(state);
  const targets = new Set();
  let sends = 0;
  for (let i = 0; i < 600; i++) {
    for (const event of step(state)) {
      if (event.kind === "send" && event.faction === "trump") {
        sends++;
        targets.add(event.to);
      }
    }
  }
  assert.ok(sends >= 3, `AI only sent ${sends} armies in 60 seconds`);
  assert.ok(targets.size >= 2, `AI only targeted ${[...targets]}`);
  assert.ok(Object.values(state.territories).filter((terr) => terr.ownerId === "red").length >= 2);
});

test("AI moves reserves from the interior to a stalled frontier", () => {
  const context = {
    team: "red", enemyTeam: "blue",
    states: [
      { id: "TX", owner: "red", troops: 10 },
      { id: "OK", owner: "red", troops: 2 },
      { id: "AR", owner: "neutral", troops: 20 },
    ],
    neighbors: { TX: ["OK"], OK: ["TX", "AR"], AR: ["OK"] },
    visibleTargets: new Set(["TX", "OK", "AR"]),
  };
  assert.deepEqual(decideAiOrders(context).map(({ from, to, intent }) => ({ from, to, intent })), [
    { from: "TX", to: "OK", intent: "support" },
  ]);
});

test("AI waits for enough troops instead of sacrificing an outnumbered army", () => {
  const context = {
    team: "red", enemyTeam: "blue",
    states: [
      { id: "TX", owner: "red", troops: 5 },
      { id: "OK", owner: "neutral", troops: 9 },
    ],
    neighbors: { TX: ["OK"], OK: ["TX"] },
    visibleTargets: new Set(["TX", "OK"]),
  };
  assert.deepEqual(decideAiOrders(context), []);
  context.states[0].troops = 11;
  assert.equal(decideAiOrders(context)[0]?.to, "OK");
});
