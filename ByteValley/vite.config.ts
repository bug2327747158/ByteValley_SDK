import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // Electron + Node.js 模块配置
    optimizeDeps: {
      exclude: [
        // 排除 Electron 相关包，不进行预构建
        'electron',
        // 排除 Node.js 内置模块（在运行时动态导入）
        'fs', 'path', 'child_process', 'os', 'util',
      ],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    // 为 Electron 渲染进程禁用一些浏览器优化
    build: {
      target: 'node18',
    },
  };
});
