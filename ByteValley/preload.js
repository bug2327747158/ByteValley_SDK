/**
 * Electron Preload Script
 * 在渲染进程加载前执行，注入Electron环境标记
 */

console.log('[preload] ========================================');
console.log('[preload] Preload script executing!');
console.log('[preload] process.type:', process.type);
console.log('[preload] process.versions:', process.versions);

// 标记当前运行在Electron环境中
window.isElectron = true;
window.electronVersion = process.versions.electron;
window.processType = process.type;
window.nodeVersion = process.versions.node;

// 暴露完整的 process 对象（用于环境检测）
window.process = {
  type: process.type,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome
  }
};

console.log('[preload] Window properties set:', {
  isElectron: window.isElectron,
  processType: window.processType,
  hasProcess: !!window.process
});
console.log('[preload] ========================================');
