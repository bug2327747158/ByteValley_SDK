import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('[main] __dirname:', __dirname);

// IPC 处理：打开文件夹选择对话框
ipcMain.handle('select-directory', async () => {
  console.log('[main] select-directory IPC called');

  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Working Directory'
  });

  console.log('[main] Dialog result:', result);

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1376,
    height: 768,
    minWidth: 1024,
    minHeight: 768,
    title: 'AI Agent Workspace',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  // Open DevTools in development to debug
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }

  // Hide the default menu bar for a cleaner look
  win.setMenuBarVisibility(false);

  // In development, load from Vite dev server
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:3000');
  } else {
    // In production, load the built index.html
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
