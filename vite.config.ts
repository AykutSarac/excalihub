import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        content: resolve(__dirname, "src/content.ts"),
        bridge: resolve(__dirname, "src/bridge.ts"),
      },
      output: {
        entryFileNames: "[name].js",
      },
    },
  },
});
