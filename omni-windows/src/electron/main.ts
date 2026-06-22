import { app, BrowserWindow, session } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLAUDE_PARTITION = 'persist:claude';
const CHATGPT_PARTITION = 'persist:chatgpt';
const PROVIDER_PARTITIONS = [CLAUDE_PARTITION, CHATGPT_PARTITION] as const;
const ELECTRON_USER_AGENT_TOKEN = /\sElectron\/\S+/g;

function createDesktopChromeUserAgent(userAgent: string): string {
  return userAgent.replace(ELECTRON_USER_AGENT_TOKEN, '').trim();
}

function configureProviderUserAgents(): void {
  const desktopChromeUserAgent = createDesktopChromeUserAgent(session.defaultSession.getUserAgent());

  PROVIDER_PARTITIONS.forEach((partition) => {
    const providerSession = session.fromPartition(partition);
    providerSession.setUserAgent(desktopChromeUserAgent);
    console.log('[Omni user agent]', partition, providerSession.getUserAgent());
  });
}

function createMainWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'Omni Workspace',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
}

app.whenReady().then(() => {
  // Configure persistent provider sessions before any webContents are created.
  configureProviderUserAgents();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
