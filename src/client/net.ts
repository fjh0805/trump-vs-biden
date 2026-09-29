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
      if (this.ws !== ws) return;
      try {
        this.onMessage(JSON.parse(ev.data as string) as ServerToClient);
      } catch {
        /* ignore */
      }
    });
    ws.addEventListener("close", () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.onClose();
    });
  }

  send(msg: ClientToServer): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
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
