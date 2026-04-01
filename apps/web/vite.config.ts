import { defineConfig } from "vite";
import unoCSS from "unocss/vite";
import vue from "@vitejs/plugin-vue";

const srcAlias: string = new URL("src", import.meta.url).pathname;

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  plugins: [vue(), unoCSS()],
  resolve: {
    alias: {
      "@": srcAlias,
    },
  },
  server: {
    proxy: {
      "/api": {
        changeOrigin: true,
        target: "http://localhost:8787",
      },
    },
  },
});
