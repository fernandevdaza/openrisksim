// Main process of the OpenRiskSim desktop app (Electron).
//
// The web build (apps/web/dist, copied to ./app) is served through a privileged custom protocol
// `app://openrisksim/` instead of file://, because the app needs a secure, same-origin context for:
//   - module Web Workers (the simulation runs in workers, multi-core mode spawns nested workers),
//   - WebGPU (only exposed to secure contexts),
//   - localStorage / IndexedDB autosave that persists between launches.
// The renderer is sandboxed and has no access to Node.
const { app, BrowserWindow, Menu, shell, nativeTheme, protocol, net } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const REPO = "https://github.com/fernandevdaza/openrisksim";
const DOCS = "https://fernandevdaza.github.io/openrisksim/docs/";
const DEV_URL = process.env.VITE_DEV_SERVER_URL; // e.g. http://localhost:5173 with `pnpm dev`
const APP_DIR = path.join(__dirname, "..", "app");
const ORIGIN = "app://openrisksim";

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// WebGPU is on by default on macOS (Metal) and Windows (D3D12); on Linux Chromium still needs the flag + Vulkan.
if (process.platform === "linux") {
  app.commandLine.appendSwitch("enable-unsafe-webgpu");
  app.commandLine.appendSwitch("enable-features", "Vulkan");
}

if (!app.requestSingleInstanceLock()) app.quit();

/** Menu language: what the user picked in the app (localStorage "openrisksim.locale") or the system one. */
let lang = "es";
function systemLang() {
  let code = "";
  try {
    code = (app.getPreferredSystemLanguages?.()[0] || app.getLocale() || "").toLowerCase();
  } catch {
    code = "";
  }
  return code.startsWith("es") ? "es" : "en";
}
const L = (es, en) => (lang === "en" ? en : es);

/** Serve files from ./app for app://openrisksim/<path>, with an index.html fallback and no path traversal. */
function registerAppProtocol() {
  protocol.handle("app", async (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/" || rel === "") rel = "/index.html";
    const file = path.normalize(path.join(APP_DIR, rel));
    if (!file.startsWith(APP_DIR)) return new Response("Forbidden", { status: 403 });
    const res = await net.fetch(pathToFileURL(file).toString()).catch(() => null);
    if (res && res.ok) return res;
    // unknown routes → the app shell (the docs live online, see the Help menu)
    return net.fetch(pathToFileURL(path.join(APP_DIR, "index.html")).toString());
  });
}

/** @type {BrowserWindow | null} */
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    title: "OpenRiskSim",
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#05070b" : "#ffffff",
    autoHideMenuBar: process.platform !== "darwin",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.loadURL(DEV_URL || `${ORIGIN}/index.html`);
  win.once("ready-to-show", () => win?.show());

  // Menus follow the language chosen in the app (ES | EN).
  win.webContents.on("did-finish-load", () => {
    win?.webContents
      .executeJavaScript(`(() => { try { return localStorage.getItem("openrisksim.locale") } catch (e) { return null } })()`)
      .then((v) => {
        const next = v === "es" || v === "en" ? v : systemLang();
        if (next !== lang) {
          lang = next;
          buildMenu();
        }
      })
      .catch(() => {});
  });

  // External links (docs, GitHub…) open in the system browser; the window never leaves the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !(DEV_URL && url.startsWith(DEV_URL))) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith(ORIGIN) || (DEV_URL && url.startsWith(DEV_URL))) return;
    e.preventDefault();
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });

  win.on("closed", () => (win = null));
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [
    ...(isMac
      ? [
          {
            label: "OpenRiskSim",
            submenu: [
              { role: "about", label: L("Acerca de OpenRiskSim", "About OpenRiskSim") },
              { type: "separator" },
              { role: "hide", label: L("Ocultar OpenRiskSim", "Hide OpenRiskSim") },
              { role: "hideOthers", label: L("Ocultar otros", "Hide Others") },
              { role: "unhide", label: L("Mostrar todo", "Show All") },
              { type: "separator" },
              { role: "quit", label: L("Salir de OpenRiskSim", "Quit OpenRiskSim") },
            ],
          },
        ]
      : [{ label: L("Archivo", "File"), submenu: [{ role: "quit", label: L("Salir", "Exit") }] }]),
    {
      label: L("Edición", "Edit"),
      submenu: [
        { role: "undo", label: L("Deshacer", "Undo") },
        { role: "redo", label: L("Rehacer", "Redo") },
        { type: "separator" },
        { role: "cut", label: L("Cortar", "Cut") },
        { role: "copy", label: L("Copiar", "Copy") },
        { role: "paste", label: L("Pegar", "Paste") },
        { role: "selectAll", label: L("Seleccionar todo", "Select All") },
      ],
    },
    {
      label: L("Ver", "View"),
      submenu: [
        { role: "reload", label: L("Recargar", "Reload") },
        { type: "separator" },
        { role: "resetZoom", label: L("Tamaño real", "Actual Size") },
        { role: "zoomIn", label: L("Acercar", "Zoom In") },
        { role: "zoomOut", label: L("Alejar", "Zoom Out") },
        { type: "separator" },
        { role: "togglefullscreen", label: L("Pantalla completa", "Toggle Full Screen") },
        { role: "toggleDevTools", label: L("Herramientas de desarrollo", "Developer Tools") },
      ],
    },
    {
      label: L("Ayuda", "Help"),
      submenu: [
        { label: L("Documentación", "Documentation"), click: () => shell.openExternal(DOCS + (lang === "en" ? "en/" : "")) },
        { label: L("Repositorio en GitHub", "GitHub Repository"), click: () => shell.openExternal(REPO) },
        { label: L("Reportar un problema", "Report an Issue"), click: () => shell.openExternal(REPO + "/issues/new/choose") },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  app.setAboutPanelOptions({
    applicationName: "OpenRiskSim",
    applicationVersion: app.getVersion(),
    copyright: L("Licencia GPL-3.0", "GPL-3.0 License"),
    website: REPO,
  });
}

app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  registerAppProtocol();
  lang = systemLang();
  buildMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
