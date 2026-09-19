import { resumeSfx } from "./sfx";

const MUTE_KEY = "tdbd-bgm-muted";
const TRACK_KEY = "tdbd-bgm-track";

/** Built-in public-domain marches + YMCA rally theme. */
export const BGM_TRACKS = {
  march: { id: "march", label: "进行曲", src: "/assets/bgm.mp3" },
  charge: { id: "charge", label: "冲击", src: "/assets/bgm-charge.mp3" },
  ymca: { id: "ymca", label: "YMCA", src: "/assets/bgm-ymca.mp3" },
} as const;

export type BgmTrackId = keyof typeof BGM_TRACKS;

let audio: HTMLAudioElement | null = null;
let started = false;
let trackId: BgmTrackId = "ymca";

function muted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function setMutedPref(v: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, v ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function loadTrackPref(): BgmTrackId {
  try {
    const v = localStorage.getItem(TRACK_KEY);
    if (v && v in BGM_TRACKS) return v as BgmTrackId;
  } catch {
    /* ignore */
  }
  return "ymca";
}

function saveTrackPref(id: BgmTrackId) {
  try {
    localStorage.setItem(TRACK_KEY, id);
  } catch {
    /* ignore */
  }
}

function currentSrc(): string {
  return BGM_TRACKS[trackId].src;
}

function el(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(currentSrc());
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0.85;
  }
  return audio;
}

function applySrc(src: string) {
  const a = el();
  a.pause();
  a.src = src;
  a.loop = true;
  a.volume = 0.85;
  a.load();
  if (started && !muted()) void a.play().catch(() => {});
}

export function initBgm(): void {
  trackId = loadTrackPref();
  const a = el();
  const want = new URL(currentSrc(), location.href).href;
  if (a.src !== want) {
    a.src = currentSrc();
    a.loop = true;
    a.volume = 0.85;
  }
}

export function getBgmTrack(): BgmTrackId {
  return trackId;
}

export function setBgmTrack(id: BgmTrackId) {
  if (!(id in BGM_TRACKS)) return;
  trackId = id;
  saveTrackPref(id);
  applySrc(BGM_TRACKS[id].src);
  paintBgmButtons();
}

export function isBgmMuted() {
  return muted();
}

export function startBgm() {
  started = true;
  resumeSfx();
  initBgm();
  if (muted()) return;
  const a = el();
  const want = new URL(currentSrc(), location.href).href;
  if (a.src !== want) applySrc(currentSrc());
  a.volume = 0.85;
  void a.play().catch(() => {});
}

export function stopBgm() {
  started = false;
  audio?.pause();
}

export function setBgmMuted(v: boolean) {
  setMutedPref(v);
  const a = el();
  if (v) a.pause();
  else if (started) void a.play().catch(() => {});
}

export function toggleBgmMuted() {
  setBgmMuted(!muted());
  return muted();
}

export function paintBgmButtons() {
  const label = muted() ? "音乐关" : "音乐";
  for (const id of ["btn-bgm", "btn-bgm-hud"]) {
    const n = document.getElementById(id);
    if (!n) continue;
    n.textContent = label;
    n.classList.toggle("muted", muted());
  }
  document.querySelectorAll<HTMLElement>("#bgm-tracks [data-track]").forEach((btn) => {
    const id = btn.dataset.track as BgmTrackId;
    btn.classList.toggle("on", id === trackId);
  });
}
