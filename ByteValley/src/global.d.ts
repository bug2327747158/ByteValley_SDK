/**
 * 全局类型声明
 */

// 扩展 Window 接口，添加 Electron 环境标记
declare global {
  interface Window {
    // Electron 环境标记（由 preload.js 注入）
    isElectron?: boolean;
    electronVersion?: string;
    processType?: string;
    nodeVersion?: string;
    process?: {
      type?: string;
      versions?: {
        electron?: string;
        node?: string;
      };
    };
  }
}

export {};
