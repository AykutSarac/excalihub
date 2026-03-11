import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      entry: "src/content.ts",
      formats: ["iife"],
      name: "excalihub",
      fileName: () => "content.js",
    },
    rollupOptions: {
      output: {
        entryFileNames: "content.js",
      },
    },
  },
});
