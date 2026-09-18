import { GameRoom, randomCode } from "./room";
import { CODE_ALPHABET, CODE_LENGTH } from "../src/shared/constants";

export { GameRoom };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors() });
    }

    if (url.pathname === "/api/health") {
      return json({ ok: true });
    }

    if (url.pathname === "/api/rooms" && request.method === "POST") {
      let code = randomCode();
      for (let i = 0; i < 6; i++) {
        const meta = await env.ROOM.getByName(code).getMeta();
        if (!meta.exists) break;
        code = randomCode();
      }
      return json({ code });
    }

    if (url.pathname === "/api/rooms/lookup" && request.method === "GET") {
      const code = (url.searchParams.get("code") ?? "").toUpperCase();
      if (code.length !== CODE_LENGTH || [...code].some((c) => !CODE_ALPHABET.includes(c))) {
        return json({ exists: false }, 400);
      }
      const meta = await env.ROOM.getByName(code).getMeta();
      return json(meta);
    }

    if (url.pathname === "/api/ws") {
      const code = (url.searchParams.get("code") ?? "").toUpperCase();
      if (code.length !== CODE_LENGTH || [...code].some((c) => !CODE_ALPHABET.includes(c))) {
        return new Response("bad room code", { status: 400 });
      }
      const stub = env.ROOM.getByName(code);
      return stub.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...cors() },
  });
}
