import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const { outputFiles } = await build({
  entryPoints: ["worker/room.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  plugins: [{
    name: "worker-runtime",
    setup(build) {
      build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "runtime", namespace: "test" }));
      build.onLoad({ filter: /.*/, namespace: "test" }, () => ({
        contents: "export class DurableObject { constructor(ctx) { this.ctx = ctx; } }",
        loader: "js",
      }));
    },
  }],
});
const { GameRoom } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`);
globalThis.WebSocket = { OPEN: 1 };

function socket(code) {
  let attachment = { playerId: "", code };
  return {
    readyState: 1,
    messages: [],
    closed: false,
    deserializeAttachment: () => attachment,
    serializeAttachment: (next) => { attachment = next; },
    send(text) { this.messages.push(JSON.parse(text)); },
    close() { this.closed = true; },
  };
}

function room(sockets) {
  const data = new Map();
  const ctx = {
    storage: {
      get: async (key) => data.get(key),
      put: async (key, value) => { data.set(key, value); },
      setAlarm: async () => {},
    },
    getWebSockets: () => sockets,
  };
  return new GameRoom(ctx);
}

test("room token blocks impersonation and survives start, rematch, and reconnect", async () => {
  const sockets = [socket("ACDE")];
  const game = room(sockets);
  const hostToken = crypto.randomUUID();
  const hello = { type: "hello", playerId: "host", roomToken: hostToken, name: "host", code: "ACDE", intent: "create", mode: "1v1", faction: "trump", home: "TX" };
  await game.onHello(sockets[0], hello);
  assert.equal(game.memory.players[0].roomToken, hostToken);
  assert.ok(!JSON.stringify(sockets[0].messages).includes(hostToken));

  const impostor = socket("ACDE");
  sockets.push(impostor);
  await game.onHello(impostor, { ...hello, intent: "join", roomToken: crypto.randomUUID() });
  assert.equal(impostor.messages.at(-1).type, "error");
  assert.equal(impostor.deserializeAttachment().playerId, "");
  assert.equal(sockets[0].closed, false);

  await game.webSocketMessage(sockets[0], JSON.stringify({ type: "start" }));
  assert.equal(game.memory.players.find((p) => p.id === "host").roomToken, hostToken);
  const replacement = socket("ACDE");
  sockets.push(replacement);
  await game.onHello(replacement, { ...hello, intent: "join" });
  assert.equal(sockets[0].deserializeAttachment().playerId, "");
  assert.equal(sockets[0].closed, true);
  assert.equal(game.socketOf("host"), replacement);

  game.memory.phase = "ended";
  await game.webSocketMessage(replacement, JSON.stringify({ type: "rematch" }));
  assert.equal(game.memory.players.find((p) => p.id === "host").roomToken, hostToken);
});

test("legacy rooms cannot silently claim an existing player", async () => {
  const sockets = [socket("ACDE")];
  const game = room(sockets);
  const token = crypto.randomUUID();
  await game.onHello(sockets[0], { type: "hello", playerId: "host", roomToken: token, name: "host", code: "ACDE", intent: "create" });
  delete game.memory.players[0].roomToken;
  const newcomer = socket("ACDE");
  sockets.push(newcomer);
  await game.onHello(newcomer, { type: "hello", playerId: "host", roomToken: token, name: "host", code: "ACDE", intent: "join" });
  assert.match(newcomer.messages.at(-1).message, /旧房间/);
  assert.equal(newcomer.deserializeAttachment().playerId, "");
});

test("a second player joins with an independent secret that is never broadcast", async () => {
  const sockets = [socket("ACDE"), socket("ACDE")];
  const game = room(sockets);
  const hostToken = crypto.randomUUID();
  const guestToken = crypto.randomUUID();
  await game.onHello(sockets[0], { type: "hello", playerId: "host", roomToken: hostToken, name: "host", code: "ACDE", intent: "create" });
  await game.onHello(sockets[1], { type: "hello", playerId: "guest", roomToken: guestToken, name: "guest", code: "ACDE", intent: "join" });
  assert.equal(game.memory.players.length, 2);
  assert.equal(game.memory.players[1].roomToken, guestToken);
  assert.ok(!JSON.stringify(sockets.map((ws) => ws.messages)).includes(guestToken));
  await game.webSocketMessage(sockets[0], JSON.stringify({ type: "start" }));
  assert.equal(game.memory.players.find((p) => p.id === "guest").roomToken, guestToken);
});

test("AI handover tells the remaining player to drop the disconnected voice peer", async () => {
  const sockets = [socket("ACDE"), socket("ACDE")];
  const game = room(sockets);
  await game.onHello(sockets[0], { type: "hello", playerId: "host", roomToken: crypto.randomUUID(), name: "host", code: "ACDE", intent: "create" });
  await game.onHello(sockets[1], { type: "hello", playerId: "guest", roomToken: crypto.randomUUID(), name: "guest", code: "ACDE", intent: "join" });
  await game.webSocketMessage(sockets[0], JSON.stringify({ type: "start" }));
  game.memory.players[1].connected = false;
  game.memory.players[1].disconnectedAt = Date.now() - 20_000;
  sockets[1].readyState = 3;
  await game.alarm();
  assert.equal(game.memory.players[1].isAI, true);
  assert.deepEqual(sockets[0].messages.at(-1), { type: "peers", ids: [] });
});

test("the final capture broadcasts an ended snapshot to the defeated player", async () => {
  const sockets = [socket("ACDE"), socket("ACDE")];
  const game = room(sockets);
  await game.onHello(sockets[0], {
    type: "hello", playerId: "host", roomToken: crypto.randomUUID(),
    name: "host", code: "ACDE", intent: "create", home: "TX",
  });
  await game.onHello(sockets[1], {
    type: "hello", playerId: "guest", roomToken: crypto.randomUUID(),
    name: "guest", code: "ACDE", intent: "join",
  });
  await game.webSocketMessage(sockets[0], JSON.stringify({ type: "start" }));
  const state = game.memory;
  const target = state.players.find((p) => p.id === "guest").home;
  state.territories[target].troops = 0.9;
  state.armies.push({
    id: "a-test", ownerId: "host", faction: "trump", from: "TX", to: target,
    troops: 2, progress: 1, speed: 0, x: 0, y: 0, arrived: true,
  });

  await game.alarm();
  const last = sockets[1].messages.at(-1);
  assert.equal(last.type, "snapshot");
  assert.equal(last.phase, "ended");
  assert.equal(last.winner, "trump");
  assert.match(last.reason, /领土与部队全部失去/);
});
