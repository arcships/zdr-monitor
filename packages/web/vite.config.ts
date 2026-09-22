import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  base: process.env.VITE_BASE_PATH || "/",
  // 前端源码使用 packages/web/tsconfig.json；不要把根目录的 Bun 配置传给浏览器构建。
  resolve: { alias: { "@": path.join(import.meta.dirname, "src") } },
  root: path.join(import.meta.dirname, "src"),
  publicDir: path.join(import.meta.dirname, "public"),
  build: { outDir: path.join(import.meta.dirname, "dist"), emptyOutDir: true },
})
