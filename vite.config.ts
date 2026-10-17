import { defineConfig } from "vite";
export default defineConfig({
  base: "/dinoplat.github.io/",
  build: { target: "es2018", assetsInlineLimit: 0 },
});
