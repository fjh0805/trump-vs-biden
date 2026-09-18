import { DurableObject } from "cloudflare:workers";
import { CODE_ALPHABET, CODE_LENGTH, HOST_HOLD_MS, PEER_WAIT_MS, TICK_MS, resolveHome } from "../src/shared/constants";
import type { ClientToServer, GameEvent, SignalPayload } from "../src/shared/protocol";
import type { RoomState } from "../src/shared/room-state";
import { snapshotFor } from "./fog";
import { layoutPlayers, seedMatch, sendArmy, step } from "./simulate";

interface Attachment {
  playerId: string;
  code: string;
}

export class GameRoom extends DurableObject<Env> {
  private memory: RoomState | null = null;
  private pending: GameEvent[] = [];

  private async load(): Promise<RoomState | null> {
    if (this.memory) return this.memory;
    this.memory = (await this.ctx.storage.get<RoomState>("room")) ?? null;
    return this.memory;
  }

  private async save(state: RoomState) {
    this.memory = state;
    await this.ctx.storage.put("room", state);
  }

  async getMeta() {
    const s = await this.load();
    return {
      exists: !!s,
      phase: s?.phase ?? null,
      players: s?.players.filter((p) => !p.isAI).length ?? 0,
      mode: s?.mode ?? null,
    };
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const url = new URL(request.url);
    const code = (url.searchParams.get("code") ?? "").toUpperCase();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId: "", code } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    let msg: ClientToServer;
    try {
      msg = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "消息格式错误" }));
      return;
    }
    try {
      await this.handle(ws, msg);
    } catch (err) {
      console.error("room message failed", err);
      ws.send(JSON.stringify({ type: "error", message: "房间处理失败" }));
    }
  }

  async webSocketClose(ws: WebSocket) {
    const att = (ws.deserializeAttachment() as Attachment | null) ?? { playerId: "" };
    const state = await this.load();
    if (!state || !att.playerId) return;
    const p = state.players.find((x) => x.id === att.playerId);
    if (p) {
      p.connected = false;
      p.speaking = false;
      p.disconnectedAt = Date.now();
    }
    await this.save(state);
    this.broadcast();
    const alarm = await this.ctx.storage.getAlarm();
    if (!alarm) await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
  }

  async alarm() {
    const state = await this.load();
    if (!state) return;
    this.reapHold(state);
    if (state.phase === "playing") {
      const events = step(state);
      this.pending.push(...events);
      await this.save(state);
      this.flush();
      if (state.phase === "playing") await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
      return;
    }
    const host = state.players.find((p) => p.id === state.hostId);
    if (host && !host.connected && host.disconnectedAt && Date.now() - host.disconnectedAt < HOST_HOLD_MS) {
      await this.save(state);
      await this.ctx.storage.setAlarm(Date.now() + 1000);
    }
  }

  private reapHold(state: RoomState) {
    const now = Date.now();
    for (const p of state.players) {
      if (p.connected || p.disconnectedAt <= 0) continue;
      if (!p.isHost && state.phase === "playing" && now - p.disconnectedAt >= PEER_WAIT_MS) {
        p.aiHold = true;
        p.isAI = true;
      }
      if (p.isHost && state.phase === "playing" && now - p.disconnectedAt >= HOST_HOLD_MS) {
        p.aiHold = true;
        p.isAI = true;
      }
    }
  }

  private async handle(ws: WebSocket, msg: ClientToServer) {
    if (msg.type === "hello") {
      await this.onHello(ws, msg);
      return;
    }
    const att = ws.deserializeAttachment() as Attachment;
    if (!att?.playerId) {
      ws.send(JSON.stringify({ type: "error", message: "请先握手" }));
      return;
    }
    const state = await this.load();
    if (!state) {
      ws.send(JSON.stringify({ type: "error", message: "房间不存在" }));
      return;
    }
    const player = state.players.find((p) => p.id === att.playerId);
    if (!player) {
      ws.send(JSON.stringify({ type: "error", message: "你不在这个房间" }));
      return;
    }

    if (msg.type === "start") {
      if (!player.isHost) {
        ws.send(JSON.stringify({ type: "error", message: "只有房主可以开始" }));
        return;
      }
      const humans = state.players.filter((p) => !p.isAI);
      if (state.mode === "2v2" && humans.length < 2) {
        ws.send(JSON.stringify({ type: "error", message: "合作模式需要两位队友" }));
        return;
      }
      if (state.mode === "1v1" && humans.length < 1) {
        ws.send(JSON.stringify({ type: "error", message: "至少需要一名玩家" }));
        return;
      }
      const named: { id: string; name: string; home?: string }[] = humans.map((h) => ({
        id: h.id,
        name: h.name,
        home: h.home,
      }));
      if (state.mode === "1v1" && named.length === 1) {
        named.push({ id: "ai-east", name: "电脑对手", home: "random" });
      }
      state.players = layoutPlayers(state.mode, state.humanFaction, named, state.hostId);
      for (const p of state.players) {
        const live = this.socketOf(p.id);
        p.connected = p.isAI || !!live;
      }
      seedMatch(state);
      await this.save(state);
      await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
      this.broadcast();
      this.sendPeerLists();
      return;
    }

    if (msg.type === "send") {
      const err = sendArmy(state, player.id, msg.from, msg.to, msg.ratio);
      if (err) {
        ws.send(JSON.stringify({ type: "error", message: err }));
        return;
      }
      this.pending.push({ kind: "send", from: msg.from, to: msg.to, faction: player.faction, scout: msg.ratio <= 0.3 });
      await this.save(state);
      this.flush();
      return;
    }

    if (msg.type === "chat") {
      const text = msg.text.trim().slice(0, 140);
      if (!text) return;
      state.chat.push({
        id: ++state.chatSeq,
        from: player.id,
        name: player.name,
        text,
        t: Date.now(),
      });
      if (state.chat.length > 80) state.chat.splice(0, state.chat.length - 80);
      await this.save(state);
      this.broadcast();
      return;
    }

    if (msg.type === "mute") {
      player.muted = msg.muted;
      await this.save(state);
      this.broadcast();
      return;
    }

    if (msg.type === "speaking") {
      player.speaking = msg.speaking;
      this.broadcast();
      return;
    }

    if (msg.type === "pickHome") {
      if (state.phase !== "lobby") return;
      player.home = resolveHome(player.faction, msg.home, state.mode === "2v2" ? player.zone : undefined);
      await this.save(state);
      this.broadcast();
      return;
    }

    if (msg.type === "rematch") {
      if (state.phase !== "ended") return;
      const humans: { id: string; name: string; home?: string }[] = state.players
        .filter((p) => !p.isAI || p.aiHold)
        .map((h) => ({ id: h.id, name: h.name, home: h.home }));
      if (state.mode === "1v1" && humans.length === 1) {
        humans.push({ id: "ai-east", name: "电脑对手", home: "random" });
      }
      state.players = layoutPlayers(state.mode, state.humanFaction, humans, state.hostId);
      for (const p of state.players) p.connected = p.isAI || !!this.socketOf(p.id);
      seedMatch(state);
      await this.save(state);
      await this.ctx.storage.setAlarm(Date.now() + TICK_MS);
      this.broadcast();
      return;
    }

    if (msg.type === "signal") {
      const target = this.socketOf(msg.to);
      if (target) {
        target.send(JSON.stringify({ type: "signal", from: player.id, payload: msg.payload } satisfies { type: "signal"; from: string; payload: SignalPayload }));
      }
    }
  }

  private async onHello(
    ws: WebSocket,
    msg: Extract<ClientToServer, { type: "hello" }>,
  ) {
    const att = (ws.deserializeAttachment() as Attachment | null) ?? { playerId: "", code: msg.code };
    let state = await this.load();
    const name = (msg.name || "玩家").trim().slice(0, 12);
    if (msg.intent === "create") {
      if (state && state.players.some((p) => p.connected && !p.isAI)) {
        ws.send(JSON.stringify({ type: "error", message: "房间码已被占用" }));
        return;
      }
      const mode = msg.mode ?? "1v1";
      const faction = msg.faction ?? "trump";
      const code = (msg.code || att.code || "").toUpperCase();
      if (code.length !== CODE_LENGTH || [...code].some((c) => !CODE_ALPHABET.includes(c))) {
        ws.send(JSON.stringify({ type: "error", message: "房间码无效" }));
        return;
      }
      const zone = "west";
      const home = resolveHome(faction, msg.home ?? "random", mode === "2v2" ? zone : undefined);
      state = {
        code,
        mode,
        phase: "lobby",
        humanFaction: faction,
        hostId: msg.playerId,
        createdAt: Date.now(),
        startedAt: 0,
        endedAt: 0,
        tick: 0,
        armySeq: 1,
        chatSeq: 0,
        players: [
          {
            id: msg.playerId,
            name,
            faction,
            zone,
            home,
            isAI: false,
            isHost: true,
            connected: true,
            muted: false,
            speaking: false,
            aiHold: false,
            disconnectedAt: 0,
          },
        ],
        territories: {},
        armies: [],
        chat: [],
        winner: null,
        reason: null,
      };
      if (mode === "2v2") {
        // second human will take east; placeholder slot shown in lobby
      }
    } else {
      if (!state) {
        ws.send(JSON.stringify({ type: "error", message: "房间不存在" }));
        return;
      }
      const existing = state.players.find((p) => p.id === msg.playerId);
      if (existing) {
        existing.connected = true;
        existing.name = name;
        existing.disconnectedAt = 0;
        if (existing.aiHold) {
          existing.aiHold = false;
          existing.isAI = false;
        }
        if (msg.home) {
          existing.home = resolveHome(existing.faction, msg.home, state.mode === "2v2" ? existing.zone : undefined);
        }
      } else {
        if (state.phase !== "lobby") {
          ws.send(JSON.stringify({ type: "error", message: "对局已开始，无法加入" }));
          return;
        }
        const humans = state.players.filter((p) => !p.isAI);
        const max = 2;
        if (humans.length >= max) {
          ws.send(JSON.stringify({ type: "error", message: "房间已满" }));
          return;
        }
        const zone = humans.length === 0 ? "west" : state.mode === "2v2" ? "east" : "east";
        const faction =
          state.mode === "2v2"
            ? state.humanFaction
            : state.humanFaction === "trump"
              ? "biden"
              : "trump";
        const home = resolveHome(faction, msg.home ?? "random", state.mode === "2v2" ? zone : undefined);
        state.players.push({
          id: msg.playerId,
          name,
          faction,
          zone,
          home,
          isAI: false,
          isHost: false,
          connected: true,
          muted: false,
          speaking: false,
          aiHold: false,
          disconnectedAt: 0,
        });
      }
    }
    ws.serializeAttachment({ playerId: msg.playerId, code: (msg.code || att.code).toUpperCase() } satisfies Attachment);
    for (const other of this.ctx.getWebSockets()) {
      if (other === ws) continue;
      const prev = other.deserializeAttachment() as Attachment | null;
      if (prev?.playerId === msg.playerId) other.close(1000, "replaced");
    }
    await this.save(state);
    this.broadcast();
    this.sendPeerLists();
  }

  private socketOf(playerId: string): WebSocket | undefined {
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att?.playerId === playerId) return ws;
    }
    return undefined;
  }

  private flush() {
    const events = this.pending;
    this.pending = [];
    this.broadcast(events);
  }

  private broadcast(events: GameEvent[] = []) {
    const state = this.memory;
    if (!state) return;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att?.playerId) continue;
      const snap = snapshotFor(state, att.playerId, events);
      ws.send(JSON.stringify(snap));
    }
  }

  private sendPeerLists() {
    const state = this.memory;
    if (!state) return;
    const humans = state.players.filter((p) => !p.isAI && p.connected).map((p) => p.id);
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att?.playerId) continue;
      ws.send(JSON.stringify({ type: "peers", ids: humans.filter((id) => id !== att.playerId) }));
    }
  }
}

export function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]!).join("");
}
