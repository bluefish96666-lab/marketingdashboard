/// <reference types="vitest/config" />
import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react()],
  test: {
    // server/ 下的 .test.cjs 是 node:test 套件(vitest 不兼容), 由 `node --test` 单独跑
    exclude: ["server/**", "node_modules/**"],
  },
  // 构建时间注入, TV 调试角标用来确认服务器是否已部署新版
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      // 后端数据代理见 server/index.cjs(开发时由 `npm run dev` 自动以 PORT=3001 启动)
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
