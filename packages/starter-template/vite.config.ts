import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { decoEditorBridgePlugin } from "@decocms/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), decoEditorBridgePlugin(), reactRouter()],
  server: {
    hmr: {
      // HMR connects directly to localhost, not through tunnels (deco link)
      host: "localhost",
    },
  },
});
