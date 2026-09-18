import type { SignalPayload } from "../shared/protocol";

type SignalFn = (to: string, payload: SignalPayload) => void;

export class VoiceMesh {
  private peers = new Map<string, RTCPeerConnection>();
  private streams = new Map<string, MediaStream>();
  private audioEls = new Map<string, HTMLAudioElement>();
  private local: MediaStream | null = null;
  private muted = false;
  private speaking = false;
  private analyser: AnalyserNode | null = null;
  private raf = 0;
  onSpeaking: (speaking: boolean) => void = () => {};
  send: SignalFn = () => {};
  selfId = "";

  get isMuted() {
    return this.muted;
  }

  get hasMic() {
    return !!this.local;
  }

  async enable() {
    if (this.local) return true;
    try {
      this.local = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      this.hookAnalyser();
      return true;
    } catch {
      this.local = null;
      return false;
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.local?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }

  async syncPeers(ids: string[]) {
    const live = new Set(ids);
    for (const id of [...this.peers.keys()]) {
      if (!live.has(id)) this.drop(id);
    }
    if (!this.local) return;
    for (const id of ids) {
      if (this.peers.has(id)) continue;
      if (this.selfId < id) await this.offer(id);
      else this.ensure(id);
    }
  }

  async onSignal(from: string, payload: SignalPayload) {
    const pc = this.ensure(from);
    if (payload.kind === "offer") {
      await pc.setRemoteDescription({ type: "offer", sdp: payload.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.send(from, { kind: "answer", sdp: answer.sdp ?? "" });
    } else if (payload.kind === "answer") {
      if (!pc.currentRemoteDescription) {
        await pc.setRemoteDescription({ type: "answer", sdp: payload.sdp });
      }
    } else if (payload.kind === "ice") {
      if (payload.candidate) {
        try {
          await pc.addIceCandidate({
            candidate: payload.candidate,
            sdpMid: payload.sdpMid,
            sdpMLineIndex: payload.sdpMLineIndex,
          });
        } catch {
          /* late ice */
        }
      }
    }
  }

  stop() {
    cancelAnimationFrame(this.raf);
    for (const id of [...this.peers.keys()]) this.drop(id);
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
  }

  private ensure(id: string): RTCPeerConnection {
    const existing = this.peers.get(id);
    if (existing) return existing;
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.cloudflare.com:3478" },
        { urls: "stun:stun.l.google.com:19302" },
      ],
    });
    this.local?.getTracks().forEach((t) => pc.addTrack(t, this.local!));
    pc.addEventListener("icecandidate", (ev) => {
      this.send(id, {
        kind: "ice",
        candidate: ev.candidate?.candidate ?? null,
        sdpMid: ev.candidate?.sdpMid ?? null,
        sdpMLineIndex: ev.candidate?.sdpMLineIndex ?? null,
      });
    });
    pc.addEventListener("track", (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      this.streams.set(id, stream);
      let el = this.audioEls.get(id);
      if (!el) {
        el = new Audio();
        el.autoplay = true;
        el.setAttribute("playsinline", "true");
        this.audioEls.set(id, el);
      }
      el.srcObject = stream;
      void el.play().catch(() => {});
    });
    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") this.drop(id);
    });
    this.peers.set(id, pc);
    return pc;
  }

  private async offer(id: string) {
    const pc = this.ensure(id);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.send(id, { kind: "offer", sdp: offer.sdp ?? "" });
  }

  private drop(id: string) {
    this.peers.get(id)?.close();
    this.peers.delete(id);
    this.streams.delete(id);
    const el = this.audioEls.get(id);
    if (el) {
      el.srcObject = null;
      this.audioEls.delete(id);
    }
  }

  private hookAnalyser() {
    if (!this.local) return;
    const ac = new AudioContext();
    const src = ac.createMediaStreamSource(this.local);
    const analyser = ac.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    this.analyser = analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const loop = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      const next = !this.muted && avg > 18;
      if (next !== this.speaking) {
        this.speaking = next;
        this.onSpeaking(next);
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
}
