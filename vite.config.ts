import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [cloudflare()],
  server: {
    port: 43123,
    host: "0.0.0.0",
    strictPort: true,
  },
  preview: {
    port: 43123,
    host: "0.0.0.0",
    strictPort: true,
  },
});
