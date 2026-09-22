import "./styles.css";
import { HOME_ZH, HOMES, RULES_ZH, homesInBank, CODE_ALPHABET, CODE_LENGTH, labelZh } from "../shared/constants";
import type { Faction, HomeId, Mode } from "../shared/constants";
import { pickLine } from "../shared/banter";
import type { RoomSnapshot, ServerToClient } from "../shared/protocol";
import { COPY } from "../shared/copy";
import { headFor } from "./avatars";
import { createRoomCode, RoomSocket } from "./net";
import { linesForEnd, pushRadio } from "./radio";
import { GameView } from "./render";
import { isSfxMuted, resumeSfx, setSfxMuted, sfxWin } from "./sfx";
import { initBgm, isBgmMuted, paintBgmButtons, setBgmMuted, setBgmTrack, startBgm, type BgmTrackId } from "./bgm";
import { VoiceMesh } from "./voice";

const playerId = localId();
const sock = new RoomSocket();
const voice = new VoiceMesh();
voice.selfId = playerId;

let mode: Mode = "1v1";
let faction: Faction = "trump";
let homePick: string = "random";
let snap: RoomSnapshot | null = null;
let view: GameView | null = null;
let solo = false;
let seenVis: Set<string> | null = null;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

$<HTMLInputElement>("name").value = localStorage.getItem("tdbd-name") ?? "玩家";

document.querySelectorAll("#mode button").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll("#mode button").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    mode = (b as HTMLElement).dataset.mode as Mode;
    paintHomeButtons();
  });
});
document.querySelectorAll("#faction button").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll("#faction button").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    faction = (b as HTMLElement).dataset.faction as Faction;
    paintHomeButtons();
  });
});
$("btn-create").onclick = () => void enter("create");
$("btn-join").onclick = () => void enter("join");
$("btn-ai").onclick = () => {
  solo = true;
  mode = "1v1";
  void enter("create");
};
$("btn-start").onclick = () => sock.send({ type: "start" });
$("btn-rematch").onclick = () => sock.send({ type: "rematch" });
$("btn-chat").onclick = sendChat;
$("chat").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChat();
});
$("btn-mute").onclick = () => {
  const next = !voice.isMuted;
  voice.setMuted(next);
  sock.send({ type: "mute", muted: next });
  $("btn-mute").classList.toggle("muted", next);
  $("btn-mute").textContent = next ? COPY.mute : COPY.speaker;
};
$("btn-sfx").onclick = () => {
  const next = !isSfxMuted();
  setSfxMuted(next);
  if (!next) resumeSfx();
  paintSfx();
};
function onBgmClick() {
  if (isBgmMuted()) {
    setBgmMuted(false);
    startBgm();
  } else {
    setBgmMuted(true);
  }
  paintBgmButtons();
}
$("btn-bgm").onclick = onBgmClick;
$("btn-bgm-hud").onclick = onBgmClick;
initBgm();
document.querySelectorAll<HTMLElement>("#bgm-tracks [data-track]").forEach((btn) => {
  btn.onclick = () => {
    const id = btn.dataset.track as BgmTrackId;
    if (!id) return;
    setBgmMuted(false);
    setBgmTrack(id);
    startBgm();
    paintBgmButtons();
  };
});
paintBgmButtons();
document.getElementById("title")?.addEventListener("pointerdown", () => { resumeSfx(); startBgm(); }, { once: true });
$("btn-leave").onclick = () => {
  sock.close();
  voice.stop();
  solo = false;
  seenVis = null;
  setSheet(false);
  $("connecting").classList.remove("show");
  $("banner").classList.remove("show");
  hideTutorial();
  const feed = document.getElementById("radio-feed");
  if (feed) feed.replaceChildren();
  $("play").classList.remove("show");
  $("title").classList.add("show");
};
$("btn-mic").onclick = () => void enableMic();

const sheet = $("sheet");
const sheetBg = $("sheet-bg");
const btnHud = $("btn-hud");
function setSheet(open: boolean) {
  sheet.classList.toggle("open", open);
  sheetBg.classList.toggle("show", open);
  btnHud.setAttribute("aria-expanded", open ? "true" : "false");
  btnHud.textContent = open ? "收起" : "面板";
}
btnHud.onclick = () => setSheet(!sheet.classList.contains("open"));
sheetBg.onclick = () => setSheet(false);
$("sheet-handle").onclick = () => setSheet(!sheet.classList.contains("open"));

// 喊话功能已删除

sock.onMessage = onServer;
sock.onClose = () => toast("连接断开，尝试刷新后重新加入");

voice.send = (to, payload) => sock.send({ type: "signal", to, payload });
voice.onSpeaking = (speaking) => sock.send({ type: "speaking", speaking });

async function enter(intent: "create" | "join") {
  resumeSfx();
  startBgm();
  paintBgmButtons();
  const name = $<HTMLInputElement>("name").value.trim() || "玩家";
  localStorage.setItem("tdbd-name", name);
  let code = $<HTMLInputElement>("code").value.trim().toUpperCase();
  if (intent === "create") {
    try {
      code = await createRoomCode();
    } catch {
      toast("创建房间失败");
      return;
    }
  } else if (code.length !== CODE_LENGTH || [...code].some((c) => !CODE_ALPHABET.includes(c))) {
    toast("请输入 4 位房间码");
    return;
  }
  $("title").classList.remove("show");
  $("play").classList.add("show");
  $("connecting").classList.add("show");
  $("room-code").textContent = code;
  if (!view) {
    view = new GameView($("map") as unknown as SVGSVGElement, $("fx") as HTMLCanvasElement);
    view.ratio = 1;
    view.onSend = (from, to, ratio) => sock.send({ type: "send", from, to, ratio });
  }
  requestAnimationFrame(() => view?.camera.fitCover());
  sock.connect(code);
  try {
    await waitOpen();
  } catch {
    $("connecting").classList.remove("show");
    toast("正在连房间…失败，请重试");
    return;
  }
  sock.send({ type: "hello", playerId, name, code, intent, mode, faction, home: homePick });
  void enableMic();
  if (solo) {
    setTimeout(() => sock.send({ type: "start" }), 400);
  }
}

async function enableMic() {
  const ok = await voice.enable();
  $("btn-mic").textContent = ok ? "麦开" : "麦拒";
  if (!ok) toast("未获得麦克风：仍可看说话灯和文字聊天");
}

function waitOpen(): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = Date.now();
    const tick = () => {
      if (sock.ws?.readyState === WebSocket.OPEN) return resolve();
      if (Date.now() - t > 4000) return reject(new Error("timeout"));
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function onServer(msg: ServerToClient) {
  if (msg.type === "error") {
    $("connecting").classList.remove("show");
    if (/出兵|相邻|兵力|视野|尚未开始|目标|只能/.test(msg.message)) view?.revertLastSend();
    toast(msg.message);
    return;
  }
  if (msg.type === "signal") {
    void voice.onSignal(msg.from, msg.payload);
    return;
  }
  if (msg.type === "peers") {
    void voice.syncPeers(msg.ids);
    return;
  }
  if (msg.type === "snapshot") paint(msg);
}

function paint(s: RoomSnapshot) {
  const was = snap?.phase;
  snap = s;
  view?.render(s);
  $("room-code").textContent = s.code;
  $("score").textContent = compactScore(s);
  $("clock").textContent = fmt(s.timeLeftMs);
  $("players").innerHTML = s.players
    .map((p) => {
      const you = p.id === s.you ? "（你）" : "";
      const zone = p.zone === "west" ? "西岸" : "东岸";
      const home = HOME_ZH[p.home as HomeId] ?? p.home;
      const bot = p.isAI ? (p.aiHold ? " · 电脑暂管" : " · 电脑") : "";
      const drop = !p.connected && !p.isAI ? " · 掉线" : "";
      return `<div class="player ${p.speaking ? "talk" : ""}">
        <div class="hero-wrap ${p.speaking ? "talk" : ""}">${headFor(p.faction, 44)}</div>
        <div class="meta"><b>${p.name}${you}</b><span>${p.faction === "trump" ? "特朗普" : "拜登"} · ${zone} · ${home}${bot}${drop}${p.muted ? " · 静音" : ""}</span></div>
      </div>`;
    })
    .join("");
  $("log").innerHTML = s.chat
    .slice(-6)
    .map((c) => `<div><b>${c.name}</b> ${escapeHtml(c.text)}</div>`)
    .join("");
  $("connecting").classList.remove("show");
  const waitPeer = s.phase === "playing" && s.players.some((p) => p.id !== s.you && !p.isAI && !p.connected);
  $("banner").hidden = !waitPeer;
  $("banner").classList.toggle("show", waitPeer);
  $("banner").textContent = COPY.peerWait;
  const host = s.you === s.hostId;
  $("btn-start").style.display = host && s.phase === "lobby" ? "block" : "none";
  $("btn-start").textContent = COPY.start;
  paintLobbyHomes(s);
  if (was !== s.phase) setSheet(s.phase === "lobby");
  if (s.phase === "playing") maybeShowTutorial();
  else hideTutorial();
  const me = s.players.find((p) => p.id === s.you);
  narrate(s, me?.faction ?? "trump", was);
  const ov = $("result");
  if (s.phase === "ended") {
    ov.classList.add("show");
    const title =
      s.winner === "draw" ? "平局" : s.winner === "trump" ? "特朗普阵营获胜" : "拜登阵营获胜";
    $("result-title").textContent = title;
    $("result-reason").textContent = s.reason ?? RULES_ZH.join(" ");
    if (was !== "ended") sfxWin();
  } else ov.classList.remove("show");
}

function zhOf(id: string) {
  return labelZh(id);
}

function narrate(s: RoomSnapshot, myFaction: Faction, was: string | undefined) {
  for (const e of s.events) {
    if (e.kind === "send") {
      const zh = zhOf(e.to);
      const line = pickLine("出兵", zh, (t) => (e.scout ? t.includes("侦察") : !t.includes("侦察")));
      pushRadio("出兵", line);
    } else if (e.kind === "clash") {
      pushRadio("交火", pickLine("交火", zhOf(e.state)));
    } else if (e.kind === "capture") {
      const ours = e.faction === myFaction;
      pushRadio(
        "破城",
        pickLine("破城", zhOf(e.state), (t) => (ours ? !t.includes("失守") : t.includes("失守") || t.includes("易手"))),
      );
    }
  }

  const vis = new Set(Object.entries(s.states).filter(([, v]) => v.visible).map(([id]) => id));
  if (s.phase === "playing" && seenVis) {
    let n = 0;
    for (const id of vis) {
      if (seenVis.has(id) || n >= 2) continue;
      n += 1;
      const info = s.states[id];
      const empty = !info.ownerId;
      const enemy = info.faction && info.faction !== myFaction;
      pushRadio(
        "迷雾揭开",
        pickLine("迷雾揭开", zhOf(id), (t) => {
          if (empty) return t.includes("空州");
          if (enemy) return t.includes("敌情");
          return t.includes("视野") || t.includes("迷雾") || t.includes("地图");
        }),
      );
    }
  }
  seenVis = s.phase === "playing" ? vis : null;

  if (s.phase === "ended" && was !== "ended") {
    const won = s.winner !== "draw" && s.winner === myFaction;
    const byTroops = (s.reason ?? "").includes("兵力");
    const lines = linesForEnd({
      won,
      draw: s.winner === "draw",
      winner: s.winner,
      mode: s.mode,
      byTroops,
    });
    const box = $("result-banter");
    box.innerHTML = lines.map((t) => `<div>${escapeHtml(t)}</div>`).join("");
    pushRadio(won ? "胜利" : "失败", lines[0]);
  }
}

function paintHomeButtons() {
  const box = $("homes");
  if (!box) return;
  const zone = mode === "2v2" ? "west" : undefined;
  const list = zone ? homesInBank(faction, zone) : HOMES[faction];
  const opts: { id: string; label: string }[] = [
    ...list.map((id) => ({ id, label: HOME_ZH[id] })),
    { id: "random", label: "随机" },
  ];
  if (!opts.some((o) => o.id === homePick)) homePick = "random";
  box.innerHTML = opts
    .map((o) => `<button data-home="${o.id}" class="${o.id === homePick ? "on" : ""}">${o.label}</button>`)
    .join("");
  box.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      homePick = (b as HTMLElement).dataset.home ?? "random";
      paintHomeButtons();
    });
  });
}

function paintLobbyHomes(s: RoomSnapshot) {
  const box = $("lobby-homes");
  if (!box) return;
  if (s.phase !== "lobby") {
    box.replaceChildren();
    return;
  }
  const me = s.players.find((p) => p.id === s.you);
  if (!me) return;
  const list = s.mode === "2v2" ? homesInBank(me.faction, me.zone) : HOMES[me.faction];
  const opts: { id: string; label: string }[] = [
    ...list.map((id) => ({ id, label: HOME_ZH[id] })),
    { id: "random", label: "随机" },
  ];
  box.innerHTML = opts
    .map((o) => `<button data-home="${o.id}" class="${o.id === me.home ? "on" : ""}">${o.label}</button>`)
    .join("");
  box.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      const home = (b as HTMLElement).dataset.home ?? "random";
      homePick = home;
      sock.send({ type: "pickHome", home });
    });
  });
}

function sendChat() {
  const input = $("chat") as HTMLInputElement;
  const text = input.value.trim();
  if (!text) return;
  sock.send({ type: "chat", text });
  input.value = "";
}


function toast(text: string) {
  const t = $("toast");
  t.textContent = text;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2800);
}

function compactScore(s: RoomSnapshot) {
  if (window.innerWidth < 640) return `红${s.trumpStates} · 蓝${s.bidenStates}`;
  return `红 ${s.trumpStates}州/${s.trumpTroops}兵 · 蓝 ${s.bidenStates}州/${s.bidenTroops}兵`;
}

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function localId() {
  const k = "tdbd-id";
  let id = localStorage.getItem(k);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(k, id);
  }
  return id;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const TUTORIAL_KEY = "tdbd-tutorial-done";

function paintSfx() {
  $("btn-sfx").classList.toggle("muted", isSfxMuted());
}

function tutorialDone() {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === "1";
  } catch {
    return false;
  }
}

function paintTutorialSteps() {
  $("tutorial-steps").innerHTML = COPY.tutorial.map((t, i) => `<li class="bubble"><b>${i + 1}</b>${t}</li>`).join("");
}

function maybeShowTutorial() {
  if (tutorialDone()) {
    hideTutorial();
    return;
  }
  const box = $("tutorial");
  box.hidden = false;
  box.classList.add("show");
}

function hideTutorial() {
  const box = $("tutorial");
  box.hidden = true;
  box.classList.remove("show");
}

$("btn-tutorial").onclick = () => {
  try {
    localStorage.setItem(TUTORIAL_KEY, "1");
  } catch {
    /* ignore */
  }
  hideTutorial();
};

function applyCopy() {
  $("btn-create").textContent = COPY.create;
  $("btn-join").textContent = COPY.join;
  $("btn-start").textContent = COPY.start;
  $("btn-mute").textContent = COPY.speaker;
  $("btn-sfx").textContent = COPY.sfx;
  $("btn-tutorial").textContent = COPY.gotIt;
  document.querySelectorAll("#mode button").forEach((b) => {
    const el = b as HTMLElement;
    if (el.dataset.mode === "1v1") el.textContent = COPY.mode1;
    if (el.dataset.mode === "2v2") el.textContent = COPY.mode2;
  });
  $("banner").textContent = COPY.peerWait;
  const connecting = $("connecting").querySelector("div");
  if (connecting) connecting.textContent = COPY.connecting;
  for (const label of document.querySelectorAll("label.field")) {
    if (label.querySelector("#code")) {
      const text = [...label.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
      if (text) text.textContent = `${COPY.code}\n`;
    }
  }
}

applyCopy();
paintSfx();
paintTutorialSteps();
paintHomeButtons();

/** Title portrait carousel: Trump ↔ Biden, auto 10s, swipeable like Xiaohongshu. */
function initHeroCarousel() {
  const root = document.getElementById("hero-carousel");
  const track = document.getElementById("hero-track");
  const caption = document.getElementById("hero-caption");
  const dots = [...document.querySelectorAll("#hero-dots button")];
  if (!root || !track || !caption || dots.length < 2) return;

  const names = ["特朗普", "拜登"];
  let index = 0;
  let timer = 0;
  let dragging = false;
  let startX = 0;
  let deltaX = 0;

  const apply = (i: number, animate = true) => {
    index = (i + names.length) % names.length;
    if (!animate) track.style.transition = "none";
    track.style.transform = `translateX(${-index * 50}%)`;
    if (!animate) {
      void track.offsetWidth;
      track.style.transition = "";
    }
    caption.textContent = names[index];
    dots.forEach((d, di) => d.classList.toggle("on", di === index));
  };

  const arm = () => {
    window.clearInterval(timer);
    timer = window.setInterval(() => apply(index + 1), 10_000);
  };

  dots.forEach((d) => {
    d.addEventListener("click", () => {
      apply(Number((d as HTMLElement).dataset.i) || 0);
      arm();
    });
  });

  const onDown = (x: number) => {
    dragging = true;
    startX = x;
    deltaX = 0;
    root.classList.add("is-dragging");
    window.clearInterval(timer);
  };
  const onMove = (x: number) => {
    if (!dragging) return;
    deltaX = x - startX;
    const w = root.clientWidth || 1;
    const pct = (-index * 50) + (deltaX / w) * 50;
    track.style.transform = `translateX(${pct}%)`;
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    root.classList.remove("is-dragging");
    const w = root.clientWidth || 1;
    if (deltaX < -w * 0.18) apply(index + 1);
    else if (deltaX > w * 0.18) apply(index - 1);
    else apply(index);
    arm();
  };

  root.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    root.setPointerCapture(e.pointerId);
    onDown(e.clientX);
  });
  root.addEventListener("pointermove", (e) => onMove(e.clientX));
  root.addEventListener("pointerup", onUp);
  root.addEventListener("pointercancel", onUp);

  apply(0, false);
  arm();
}

initHeroCarousel();
