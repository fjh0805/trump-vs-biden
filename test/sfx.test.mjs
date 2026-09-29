import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const { outputFiles } = await build({
  entryPoints: ["src/client/sfx.ts"], bundle: true, format: "esm", platform: "node", write: false,
});
const url = `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`;
const previousAudioContext = globalThis.AudioContext;
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const previousFetch = globalThis.fetch;

let voices = 0;
let synth = 0;
class AudioNodeStub {
  connect() { return this; }
  start() { voices++; }
  stop() {}
}
class FakeAudioContext {
  state = "suspended";
  currentTime = 0;
  sampleRate = 1000;
  destination = {};
  resume() { this.state = "running"; return Promise.resolve(); }
  decodeAudioData() { return Promise.resolve({ duration: 1 }); }
  createBufferSource() { return new AudioNodeStub(); }
  createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  createGain() {
    return {
      connect: () => new AudioNodeStub(),
      gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    };
  }
  createOscillator() {
    synth++;
    return Object.assign(new AudioNodeStub(), {
      frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    });
  }
  createBiquadFilter() {
    return Object.assign(new AudioNodeStub(), {
      frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, Q: { value: 0 },
    });
  }
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("capture voices play through the unlocked context and respect the SFX toggle", async () => {
  globalThis.AudioContext = FakeAudioContext;
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  try {
    const sfx = await import(`${url}#success`);
    sfx.resumeSfx();
    await settle();
    sfx.sfxCapture("biden");
    await settle();
    assert.equal(voices, 1);
    sfx.setSfxMuted(true);
    sfx.sfxCapture("trump");
    await settle();
    assert.equal(voices, 1);
    sfx.setSfxMuted(false);
    sfx.sfxCapture("trump");
    await settle();
    assert.equal(voices, 2);
  } finally {
    globalThis.AudioContext = previousAudioContext;
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
    else delete globalThis.localStorage;
    globalThis.fetch = previousFetch;
  }
});

test("missing voice clips fall back to the synthesized capture sound", async () => {
  globalThis.AudioContext = FakeAudioContext;
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  globalThis.fetch = async () => ({ ok: false });
  try {
    const sfx = await import(`${url}#failure`);
    sfx.resumeSfx();
    await settle();
    sfx.sfxCapture("trump");
    await settle();
    assert.ok(synth > 0);
  } finally {
    globalThis.AudioContext = previousAudioContext;
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
    else delete globalThis.localStorage;
    globalThis.fetch = previousFetch;
  }
});
