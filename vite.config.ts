import { defineConfig } from "vite";

// Relative base path so the app works under a GitHub Pages project subpath
// (https://<user>.github.io/<repo>/) regardless of the repository name.
export default defineConfig({
  base: "./",
  // The build-free variant owns the root index.html; the optional Vite build
  // uses its own entry so the two do not conflict.
  build: {
    target: "es2020",
    outDir: "dist",
    assetsInlineLimit: 0,
    rollupOptions: {
      input: "index.vite.html",
    },
  },
  server: {
    host: true,
    open: "/index.vite.html",
  },
});
