import { app, BrowserWindow, ipcMain, session, webContents } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLAUDE_PARTITION = 'persist:claude';
const CHATGPT_PARTITION = 'persist:chatgpt';
const GEMINI_PARTITION = 'persist:gemini';
const GROK_PARTITION = 'persist:grok';
const PERPLEXITY_PARTITION = 'persist:perplexity';
const WEBSLOT_PARTITION = 'persist:webslot';
const WEBVIEW_CAPTURE_PRELOAD_PATH = path.join(__dirname, 'webviewCapture.cjs');
const WEBVIEW_CAPTURE_PRELOAD_URL = pathToFileURL(WEBVIEW_CAPTURE_PRELOAD_PATH).toString();
const PROVIDER_PARTITIONS = [
  CLAUDE_PARTITION,
  CHATGPT_PARTITION,
  GEMINI_PARTITION,
  GROK_PARTITION,
  PERPLEXITY_PARTITION,
  WEBSLOT_PARTITION,
] as const;
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
  ipcMain.handle('omni:get-app-locale', () => app.getLocale());
  ipcMain.handle('omni:set-device-emulation', (_event, webContentsId: number, enabled: boolean) => {
    const targetContents = webContents.fromId(webContentsId);

    if (!targetContents) {
      return;
    }

    if (enabled) {
      const mobileDeviceEmulationOptions = {
        screenPosition: 'mobile' as const,
        screenSize: { width: 390, height: 844 },
        viewSize: { width: 390, height: 844 },
        viewPosition: { x: 0, y: 0 },
        deviceScaleFactor: 3,
        scale: 1,
        fitToView: true,
      };

      targetContents.enableDeviceEmulation(mobileDeviceEmulationOptions);
      targetContents.setZoomFactor(1);
      setTimeout(() => {
        if (!targetContents.isDestroyed()) {
          targetContents.reload();
        }
      }, 100);
    } else {
      targetContents.disableDeviceEmulation();
    }
  });
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (_attachEvent, webPreferences, params) => {
      if (params['data-omni-slot-kind'] === 'ai') {
        webPreferences.preload = WEBVIEW_CAPTURE_PRELOAD_PATH;
      }
    });

    if (contents.getType() === 'webview') {
      const isWebSlot = contents.session === session.fromPartition(WEBSLOT_PARTITION);

      contents.setWindowOpenHandler(({ url }) => {
        if (isWebSlot) {
          void contents.loadURL(url);
          return { action: 'deny' };
        }

        return {
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
        };
      });
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
