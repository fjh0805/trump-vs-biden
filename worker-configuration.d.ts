import type { GameRoom } from "./worker/room";

declare global {
  interface Env {
    ROOM: DurableObjectNamespace<GameRoom>;
    ASSETS: Fetcher;
  }
}
