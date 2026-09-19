/** Web-Audio SFX. Default unmuted. Must resume AudioContext on a user gesture. */

const SFX_VOLUME = 0.55;
const MUTE_KEY = "tdbd-sfx-muted";

let ctx: AudioContext | null = null;
let muted = readMuted();

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Create + resume AudioContext. Call from the same user gesture that starts BGM. */
export function resumeSfx(): void {
  if (typeof AudioContext === "undefined") return;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
}

function ac(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  when = 0,
  freqEnd?: number,
) {
  if (muted) return;
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (freqEnd != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
  const peak = Math.max(0.0001, gain * SFX_VOLUME);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

/** Soft noise burst for a percussive thump body. */
function noiseBurst(dur: number, gain: number, when = 0) {
  if (muted) return;
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + when;
  const n = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 280;
  const peak = Math.max(0.0001, gain * SFX_VOLUME);
  g.gain.setValueAtTime(peak, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

export function isSfxMuted() {
  return muted;
}

export function setSfxMuted(next: boolean) {
  muted = next;
  try {
    localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (!next) resumeSfx();
}

export function sfxSend() {
  // Hearable whoosh/chirp when armies leave
  tone(520, 0.09, "sine", 0.28);
  tone(780, 0.07, "triangle", 0.18, 0.04);
}

export function sfxClash() {
  tone(140, 0.12, "triangle", 0.22);
  tone(220, 0.08, "square", 0.1, 0.02);
}

/** 原声破城音效库 - 预加载特朗普/拜登语音片段 */
let trumpVoices: HTMLAudioElement[] | null = null;
let bidenVoices: HTMLAudioElement[] | null = null;

function loadTrumpVoices() {
  if (trumpVoices) return trumpVoices;
  trumpVoices = [
    new Audio("/assets/sfx-capture-trump.mp3"),   // Wrong
    new Audio("/assets/sfx-capture-trump-2.mp3"), // MAGA
    new Audio("/assets/sfx-capture-trump-3.mp3"), // We're gonna win
  ];
  for (const a of trumpVoices) {
    a.preload = "auto";
    a.volume = SFX_VOLUME;
  }
  return trumpVoices;
}

function loadBidenVoices() {
  if (bidenVoices) return bidenVoices;
  bidenVoices = [
    new Audio("/assets/sfx-capture-biden.mp3"),   // Come on man
    new Audio("/assets/sfx-capture-biden-2.mp3"), // Gets it done
  ];
  for (const a of bidenVoices) {
    a.preload = "auto";
    a.volume = SFX_VOLUME;
  }
  return bidenVoices;
}

/** 破城音效 - 根据阵营随机播放原声 */
export function sfxCapture(faction?: "trump" | "biden") {
  resumeSfx();
  if (muted) return;

  // 根据阵营选择音频池
  const voices = faction === "biden" ? loadBidenVoices() : loadTrumpVoices();
  if (voices && voices.length > 0) {
    // 随机选择一个音频
    const voice = voices[Math.floor(Math.random() * voices.length)];
    voice.currentTime = 0;
    voice.volume = SFX_VOLUME * 0.9;
    void voice.play().catch(() => {
      // 降级到合成音效
      playSynthCapture();
    });
    return;
  }

  playSynthCapture();
}

/** 合成破城音效(降级方案): formant yell + thump, ~0.45s. */
function playSynthCapture() {
  const c = ac();
  if (!c || muted) return;
  const t0 = c.currentTime;

  // Body thump
  noiseBurst(0.16, 0.5, 0);
  tone(80, 0.3, "sine", 0.55, 0, 48);

  // Shout: band-passed noise (consonant attack) + falling formants
  const n = Math.max(1, Math.floor(c.sampleRate * 0.28));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const env = Math.pow(1 - i / n, 1.6);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(1100, t0);
  bp.frequency.exponentialRampToValueAtTime(420, t0 + 0.22);
  bp.Q.value = 0.7;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.0001, t0);
  ng.gain.exponentialRampToValueAtTime(0.62 * SFX_VOLUME, t0 + 0.018);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
  src.connect(bp).connect(ng).connect(c.destination);
  src.start(t0);
  src.stop(t0 + 0.3);

  // Vocal formants (male shout: F1~700, F2~1200)
  for (const [f0, f1, g0, delay] of [
    [620, 280, 0.42, 0.01],
    [1180, 540, 0.28, 0.02],
    [280, 140, 0.22, 0],
  ] as const) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sawtooth";
    const t = t0 + delay;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + 0.18);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(g0 * SFX_VOLUME, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.24);
  }

  tone(740, 0.12, "square", 0.2, 0.08);
}

export function sfxWin() {
  [523, 659, 784, 1046].forEach((f, i) => {
    tone(f, 0.18, "sine", 0.22, i * 0.09);
  });
}
