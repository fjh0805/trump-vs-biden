import type { ClientToServer, ServerToClient } from "../shared/protocol";

export class RoomSocket {
  ws: WebSocket | null = null;
  onMessage: (msg: ServerToClient) => void = () => {};
  onClose: () => void = () => {};

  connect(code: string) {
    this.close();
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/api/ws?code=${encodeURIComponent(code)}`);
    this.ws = ws;
    ws.addEventListener("message", (ev) => {
      try {
        this.onMessage(JSON.parse(ev.data as string) as ServerToClient);
      } catch {
        /* ignore */
      }
    });
    ws.addEventListener("close", () => this.onClose());
  }

  send(msg: ClientToServer) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close() {
    this.ws?.close();
    this.ws = null;
  }
}

export async function createRoomCode(): Promise<string> {
  const res = await fetch("/api/rooms", { method: "POST" });
  if (!res.ok) throw new Error("无法创建房间");
  const data = (await res.json()) as { code: string };
  return data.code;
}
