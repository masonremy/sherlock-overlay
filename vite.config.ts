import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "node:path";

const web = resolve(import.meta.dirname, "web");

export default defineConfig({
  root: web,
  plugins: [svelte()],
  build: {
    outDir: resolve(import.meta.dirname, "dist/web"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        overlay: resolve(web, "overlay.html"),
        control: resolve(web, "control.html"),
      },
    },
  },
});
