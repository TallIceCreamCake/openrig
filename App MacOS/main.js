import { app, BrowserWindow, shell, Menu, dialog, ipcMain } from 'electron';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Ignore le certificat auto-signé de Vite (plugin-basic-ssl) en développement
app.commandLine.appendSwitch('ignore-certificate-errors');
app.setName('OpenRIG');

// ─── Config ────────────────────────────────────────────────────────────────
const IS_PACKAGED = app.isPackaged;

// URL cible — déterminée dynamiquement au démarrage
let appUrl = null;

// ─── Variables globales ────────────────────────────────────────────────────
let mainWindow       = null;
let settingsWindow   = null;
let onboardingWindow = null;
let serverProcess    = null;

// ─── Config persistante ─────────────────────────────────────────────────────

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function readConfig() {
  try {
    const p = getConfigPath();
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  } catch {}
  return {};
}

function writeConfig(data) {
  try { writeFileSync(getConfigPath(), JSON.stringify(data, null, 2), 'utf8'); }
  catch (e) { console.error('[config]', e); }
}

// ─── Résolution de l'URL de l'app ─────────────────────────────────────────

/** Retourne l'URL configurée manuellement, ou null si aucune. */
function resolveAppUrl() {
  const config = readConfig();
  if (config.serverUrl) {
    console.log(`[main] Serveur configuré : ${config.serverUrl}`);
    return config.serverUrl;
  }
  return null;
}

// ─── Page d'erreur ─────────────────────────────────────────────────────────

let _errorPageLoading = false;
function loadErrorPage() {
  if (!mainWindow || _errorPageLoading) return;
  _errorPageLoading = true;
  setTimeout(() => { _errorPageLoading = false; }, 3000);
  mainWindow.loadURL(`data:text/html;charset=utf-8,<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>OpenRIG</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  display:flex;align-items:center;justify-content:center;
  height:100vh;margin:0;background:#f3f4f6;-webkit-app-region:drag">
  <div style="text-align:center;max-width:400px;-webkit-app-region:no-drag;padding:0 24px">
    <div style="font-size:44px;margin-bottom:16px">⚠️</div>
    <h2 style="color:#111827;margin:0 0 8px;font-size:18px">Serveur non disponible</h2>
    <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0 0 24px">
      L'application ne peut pas joindre le serveur OpenRIG.<br>
      Vérifiez l'adresse dans les paramètres ou lancez le serveur.
    </p>
    <div style="display:flex;gap:10px;justify-content:center">
      <button onclick="window.location.reload()"
        style="padding:9px 20px;background:#e5e7eb;color:#374151;border:none;
        border-radius:8px;cursor:pointer;font-size:13px;font-weight:500">
        Réessayer
      </button>
      <button onclick="window.electronApp && window.electronApp.openSettings()"
        style="padding:9px 20px;background:#2563eb;color:white;border:none;
        border-radius:8px;cursor:pointer;font-size:13px;font-weight:500">
        Paramètres
      </button>
    </div>
  </div>
</body></html>`);
}

// ─── Fenêtre principale ────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width:    1440,
    height:   900,
    minWidth: 960,
    minHeight: 600,
    titleBarStyle:        'hiddenInset',
    trafficLightPosition: { x: 16, y: 8 },
    backgroundColor:      '#f3f4f6',
    show: false,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration:  false,
      webSecurity:           false,
      allowRunningInsecureContent: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  // Fallback : affiche la fenêtre après 3s si ready-to-show n'a pas tiré
  setTimeout(() => { if (mainWindow && !mainWindow.isVisible()) mainWindow.show(); }, 3000);

  // Liens <a target="_blank"> → navigateur système
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Injecte la barre de titre à chaque chargement (le JS a un guard anti-doublon)
  mainWindow.webContents.on('did-finish-load', injectTitleBar);

  // Si le serveur ne répond pas → page d'erreur custom (au lieu de la page "Error" de Chromium)
  mainWindow.webContents.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
    if (!isMainFrame) return; // ignorer les sous-ressources
    if (code === -3) return;  // -3 = ERR_ABORTED (navigation annulée volontairement)
    loadErrorPage();
  });


  // Plein écran — masque la barre de drag
  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.executeJavaScript(`
      (() => {
        const bar = document.getElementById('__el_drag__');
        const css = document.getElementById('__el_drag_css__');
        if (bar) bar.style.display = 'none';
        if (css) css.textContent = '';
      })();
    `).catch(() => {});
  });

  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.executeJavaScript(`
      (() => {
        const bar = document.getElementById('__el_drag__');
        const css = document.getElementById('__el_drag_css__');
        if (bar) bar.style.display = 'flex';
        if (css) css.textContent = 'html, body { overflow: hidden !important; height: 100vh !important; } #root { padding-top: 30px !important; box-sizing: border-box !important; height: 100vh !important; overflow: hidden !important; } #root > div { height: calc(100vh - 30px) !important; min-height: unset !important; }';
      })();
    `).catch(() => {});
  });

  if (appUrl) {
    mainWindow.loadURL(appUrl).catch((err) => {
      console.error('[main] Erreur chargement', appUrl, err.message);
      loadErrorPage();
    });
  } else {
    loadErrorPage();
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── Fenêtre Onboarding (première ouverture) ───────────────────────────────

function openOnboardingWindow() {
  onboardingWindow = new BrowserWindow({
    width:     420,
    height:    620,
    resizable: false,
    titleBarStyle:        'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor:      '#0a0a1a',
    show: false,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  onboardingWindow.loadFile(path.join(__dirname, 'onboarding.html'));
  onboardingWindow.once('ready-to-show', () => onboardingWindow.show());
  onboardingWindow.on('closed', () => {
    onboardingWindow = null;
    if (!mainWindow) app.quit();
  });
}

// IPC : infos app pour la fenêtre Paramètres
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-server-url',  () => readConfig().serverUrl || null);
ipcMain.on('open-settings', () => openSettingsWindow());

// Sauvegarde URL serveur depuis les paramètres + recharge la fenêtre principale
ipcMain.on('save-server-url', (_e, serverUrl) => {
  const config = readConfig();
  if (serverUrl) {
    config.serverUrl = serverUrl;
  } else {
    delete config.serverUrl;
  }
  config.onboardingComplete = true;
  writeConfig(config);
  appUrl = serverUrl || null;
  if (mainWindow) {
    if (appUrl) {
      mainWindow.loadURL(appUrl).catch(() => loadErrorPage());
    } else {
      loadErrorPage();
    }
  }
});

// IPC : onboarding terminé → sauvegarder + lancer l'app principale
ipcMain.on('onboarding-complete', async (_event, serverUrl) => {
  console.log('[onboarding] reçu, serverUrl =', serverUrl);
  try {
    const config = readConfig();
    config.onboardingComplete = true;
    if (serverUrl) config.serverUrl = serverUrl;
    writeConfig(config);

    if (serverUrl) {
      appUrl = serverUrl;
    } else {
      // Pas d'URL saisie → détection automatique localhost
      try { appUrl = await resolveAppUrl(); } catch { appUrl = null; }
    }

    console.log('[onboarding] appUrl =', appUrl);

    // createWindow() avant destroy() → mainWindow != null quand 'closed' se déclenche
    createWindow();
    if (onboardingWindow) { onboardingWindow.destroy(); onboardingWindow = null; }

    console.log('[onboarding] fenêtre principale créée, onboarding fermé');
  } catch (err) {
    console.error('[onboarding] erreur:', err);
    dialog.showErrorBox('OpenRIG — Erreur', String(err));
  }
});

// ─── Fenêtre Paramètres ─────────────────────────────────────────────────────

function openSettingsWindow() {
  if (settingsWindow) { settingsWindow.focus(); return; }

  settingsWindow = new BrowserWindow({
    width:  520,
    height: 300,
    minWidth: 420,
    minHeight: 260,
    titleBarStyle:        'hiddenInset',
    trafficLightPosition: { x: 14, y: 8 },
    backgroundColor:      '#f5f5f7',
    show: false,
    resizable: true,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// ─── Barre de titre visible + drag ─────────────────────────────────────────

function injectTitleBar() {
  if (!mainWindow) return;

  mainWindow.webContents.executeJavaScript(`
    (function () {
      if (document.getElementById('__el_drag__')) return;

      const H = 30;

      // Décale le contenu de l'app vers le bas
      const cssRoot = document.createElement('style');
      cssRoot.id = '__el_drag_css__';
      cssRoot.textContent = \`
        html, body {
          overflow: hidden !important;
          height: 100vh !important;
        }
        #root {
          padding-top: \${H}px !important;
          box-sizing: border-box !important;
          height: 100vh !important;
          overflow: hidden !important;
        }
        /* Le div racine du Layout utilise h-screen (100vh) — on le corrige */
        #root > div {
          height: calc(100vh - \${H}px) !important;
          min-height: unset !important;
        }
      \`;
      document.head.appendChild(cssRoot);

      // Barre visible
      const bar = document.createElement('div');
      bar.id = '__el_drag__';
      bar.style.cssText = \`
        position: fixed;
        top: 0; left: 0; right: 0;
        height: \${H}px;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        -webkit-app-region: drag;
        user-select: none;
        background: rgba(249,250,251,0.88);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-bottom: 1px solid rgba(0,0,0,0.08);
      \`;

      // Titre de la page (centré)
      const title = document.createElement('span');
      title.id = '__el_drag_title__';
      title.style.cssText = \`
        font-size: 13px;
        font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
        color: #374151;
        -webkit-app-region: no-drag;
        max-width: 50%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        letter-spacing: -0.01em;
      \`;

      const getTitle = () => {
        const raw = document.title || '';
        if (raw.includes(' · ')) return raw.split(' · ')[0].trim();
        if (raw === 'Open RIG') return '';
        return raw;
      };

      title.textContent = getTitle();

      // Sync avec les changements de titre (navigation SPA)
      const titleEl = document.querySelector('title');
      if (titleEl) {
        new MutationObserver(() => { title.textContent = getTitle(); })
          .observe(titleEl, { childList: true, characterData: true, subtree: true });
      }

      bar.appendChild(title);
      document.body.appendChild(bar);

      // Adaptation thème sombre
      const applyTheme = () => {
        const dark = document.documentElement.classList.contains('dark');
        bar.style.background = dark ? 'rgba(17,24,39,0.90)' : 'rgba(249,250,251,0.88)';
        bar.style.borderBottomColor = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';
        title.style.color = dark ? 'rgba(255,255,255,0.85)' : '#374151';
      };

      applyTheme();
      new MutationObserver(applyTheme)
        .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    })();
  `).catch(() => {});
}

// ─── Menu application (macOS) ──────────────────────────────────────────────

function buildAppMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about', label: `À propos de ${app.name}` },
        { type: 'separator' },
        {
          label: 'Paramètres',
          accelerator: 'CmdOrCtrl+,',
          click: () => openSettingsWindow(),
        },
        { type: 'separator' },
        { role: 'hide', label: `Masquer ${app.name}` },
        { role: 'hideOthers', label: 'Masquer les autres' },
        { type: 'separator' },
        { role: 'quit', label: `Quitter ${app.name}` },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Boîte "À propos" native enrichie
  app.setAboutPanelOptions({
    applicationName:    'OpenRIG',
    applicationVersion: app.getVersion(),
    version:            `Electron ${process.versions.electron} · Node ${process.versions.node}`,
    copyright:          '© 2025–2026 OpenRIG\nGestionnaire de location de matériel\naudiovisuel et événementiel.',
    credits:            `Chromium ${process.versions.chrome} · V8 ${process.versions.v8}`,
  });

  buildAppMenu();

  // Première ouverture → onboarding
  const config = readConfig();
  if (!config.onboardingComplete) {
    openOnboardingWindow();
    return;
  }

  try {
    appUrl = await resolveAppUrl();
  } catch (err) {
    if (IS_PACKAGED) {
      dialog.showErrorBox('OpenRIG — Erreur de démarrage', err.message);
      app.quit();
      return;
    }
    appUrl = null;
  }

  createWindow();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) { serverProcess.kill(); serverProcess = null; }
});
