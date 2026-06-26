import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLAUDE_PARTITION = 'persist:claude';
const CHATGPT_PARTITION = 'persist:chatgpt';
const GEMINI_PARTITION = 'persist:gemini';
const GROK_PARTITION = 'persist:grok';
const PERPLEXITY_PARTITION = 'persist:perplexity';
const WEBVIEW_CAPTURE_PRELOAD_PATH = path.join(__dirname, 'webviewCapture.cjs');
const WEBVIEW_CAPTURE_PRELOAD_URL = pathToFileURL(WEBVIEW_CAPTURE_PRELOAD_PATH).toString();
const PROVIDER_PARTITIONS = [CLAUDE_PARTITION, CHATGPT_PARTITION, GEMINI_PARTITION, GROK_PARTITION, PERPLEXITY_PARTITION] as const;
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
  ipcMain.handle('omni:get-webview-capture-preload-url', () => WEBVIEW_CAPTURE_PRELOAD_URL);
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (_attachEvent, webPreferences) => {
      webPreferences.preload = WEBVIEW_CAPTURE_PRELOAD_PATH;
    });

    if (contents.getType() === 'webview') {
      contents.setWindowOpenHandler(() => ({
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 720,
          minWidth: 420,
          minHeight: 560,
          autoHideMenuBar: true,
          parent: BrowserWindow.fromWebContents(contents) ?? undefined,
          modal: false,
          webPreferences: {
            session: contents.session,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
          },
        },
      }));
    }
  });
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
