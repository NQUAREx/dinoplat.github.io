import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: { target: "es2018", assetsInlineLimit: 0 },
});
