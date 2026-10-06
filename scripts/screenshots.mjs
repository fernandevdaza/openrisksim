// Generates the project images with a local Chrome/Chromium (puppeteer-core):
//   apps/web/public/icon*.png + docs/public/icon.svg   app icons
//   docs/public/banner.png, banner.es.png             README banners
//   docs/public/screenshots/{es,en}/*.png             app screenshots (README + docs)
// Usage:  pnpm screenshots        (builds the web app, serves it and drives it)
// Env:    CHROME_PATH=/path/to/chrome   ONLY=banner|icons|app
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = (...p) => {
  const f = path.join(ROOT, ...p);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  return f;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ONLY = process.env.ONLY;

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  ].filter(Boolean);
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error("Chrome not found. Set CHROME_PATH.");
  return found;
}

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--no-first-run", "--hide-scrollbars", "--enable-unsafe-webgpu"] });

// ---------------------------------------------------------------- icons
async function icons() {
  const svg = fs.readFileSync(path.join(ROOT, "scripts/brand/icon.svg"), "utf8");
  for (const dest of ["apps/web/public/icon.svg", "docs/public/icon.svg"]) fs.writeFileSync(out(dest), svg);
  const page = await browser.newPage();
  for (const [size, file] of [[512, "icon-512.png"], [192, "icon-192.png"], [180, "apple-touch-icon.png"]]) {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
    await page.screenshot({ path: out("apps/web/public", file), omitBackground: true });
    console.log("✓ apps/web/public/" + file);
  }
  // desktop installers (electron-builder derives .icns / .ico from a 1024 px PNG)
  await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('width="512" height="512"', 'width="1024" height="1024"')}</body></html>`);
  await page.screenshot({ path: out("apps/desktop/build", "icon.png"), omitBackground: true });
  console.log("✓ apps/desktop/build/icon.png");
  await page.close();
}

// ---------------------------------------------------------------- banners
async function banners() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 480, deviceScaleFactor: 2 });
  for (const [lang, file] of [["en", "banner.png"], ["es", "banner.es.png"]]) {
    await page.goto(pathToFileURL(path.join(ROOT, "scripts/brand/banner.html")).href + "?lang=" + lang, { waitUntil: "networkidle0" });
    await page.evaluate(() => document.fonts.ready);
    await sleep(300);
    await page.screenshot({ path: out("docs/public", file) });
    console.log("✓ docs/public/" + file);
  }
  await page.close();
}

// ---------------------------------------------------------------- app screenshots
const LABELS = {
  es: {
    file: "Archivo", examples: "Ejemplos", openExample: "Abrir ejemplo", run: "Ejecutar",
    simulation: "Simulación", analysis: "Herramientas analíticas", forecast: "Pronóstico", optimization: "Optimización", finance: "Finanzas",
    settings: "Configuración", accelHeading: "Aceleración",
    project: "Evaluación de proyecto", inventory: "Inventario (vendedor de periódicos)", defineAssumption: "Definir supuesto",
    tornado: "Tornado", fitting: "Ajuste de distribuciones", timeseries: "Series de tiempo", evaluator: "Evaluador de proyectos", optim: "Optimización",
    paste: "Pegar datos", fit: "Ajustar", forecastRun: "Pronosticar", optimize: "Optimizar",
    stochastic: "Estocástica (con simulación)", maxEval: "Máx. evaluaciones", trials: "Pruebas por simulación",
  },
  en: {
    file: "File", examples: "Examples", openExample: "Open example", run: "Run",
    simulation: "Simulation", analysis: "Analytical tools", forecast: "Forecasting", optimization: "Optimization", finance: "Finance",
    settings: "Settings", accelHeading: "Acceleration",
    project: "Project evaluation", inventory: "Inventory (newsvendor)", defineAssumption: "Define assumption",
    tornado: "Tornado", fitting: "Distribution fitting", timeseries: "Time series", evaluator: "Project evaluator", optim: "Optimization",
    paste: "Paste data", fit: "Fit", forecastRun: "Forecast", optimize: "Optimize",
    stochastic: "Stochastic (with simulation)", maxEval: "Max. evaluations", trials: "Trials per simulation",
  },
};

function serve() {
  return new Promise((resolve, reject) => {
    const p = spawn("pnpm", ["--filter", "@openrisksim/web", "exec", "vite", "preview", "--port", "4179", "--strictPort"], { cwd: ROOT, stdio: ["ignore", "pipe", "inherit"] });
    p.stdout.on("data", (d) => String(d).includes("4179") && resolve(p));
    p.on("exit", (c) => reject(new Error("preview exited " + c)));
  });
}

/** Click the first visible element (button/tab/option/radio) whose text or aria-label equals `text`. */
async function click(page, text, { within = "body", exact = true, nth = 0 } = {}) {
  const ok = await page.evaluate(
    (text, within, exact, nth) => {
      const root = document.querySelector(within) ?? document.body;
      const els = [...root.querySelectorAll("button,[role=tab],[role=radio],[role=option],a,label")].filter((e) => {
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        const t = (e.getAttribute("aria-label") || e.textContent || "").trim().replace(/\s+/g, " ");
        return exact ? t === text : t.includes(text);
      });
      const el = els[nth];
      if (!el) return false;
      el.click();
      return true;
    },
    text, within, exact, nth,
  );
  if (!ok) throw new Error(`click: "${text}" not found`);
  await sleep(350);
}

async function selectOptionByText(page, text) {
  await page.evaluate((text) => {
    for (const s of document.querySelectorAll("select")) {
      const o = [...s.options].find((o) => o.text.trim() === text);
      if (o) {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
        setter.call(s, o.value);
        s.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
    }
    throw new Error("option not found " + text);
  }, text);
  await sleep(300);
}

async function setTextarea(page, value) {
  await page.evaluate((value) => {
    const d = [...document.querySelectorAll("[role=dialog]")].pop();
    const ta = [...d.querySelectorAll("textarea")].find((t) => t.getBoundingClientRect().width > 0);
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(ta, value);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
  await sleep(200);
}

/** Set a NumberInput that sits under a <label>/field with the given caption inside the top dialog. */
async function setField(page, caption, value) {
  await page.evaluate((caption, value) => {
    const d = [...document.querySelectorAll("[role=dialog]")].pop();
    const cap = [...d.querySelectorAll("span,div,label")].find((e) => e.children.length === 0 && e.textContent.trim() === caption);
    let box = cap;
    let input = null;
    while (box && box !== d && !(input = box.querySelector("input"))) box = box.parentElement;
    if (!input) throw new Error("field not found " + caption);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.blur();
  }, caption, value);
  await sleep(200);
}

async function closeModals(page) {
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Escape");
    await sleep(150);
  }
}

async function openExample(page, L, name) {
  await click(page, L.file);
  await click(page, L.examples);
  await click(page, name, { within: "[role=dialog]", exact: false });
  await click(page, L.openExample, { within: "[role=dialog]" }).catch(() => {});
  await sleep(800);
  // a confirm dialog may ask to replace the current workbook
  await page.evaluate(() => {
    const d = document.querySelector("[role=dialog]");
    const b = d && [...d.querySelectorAll("button")].find((b) => b.className.includes("bg-blue-700") || b.className.includes("bg-red-600"));
    b?.click();
  });
  await sleep(800);
}

async function run(page, L) {
  await click(page, L.simulation);
  await click(page, L.run);
  await page.waitForFunction(() => !document.body.innerText.match(/Simulando|Simulating/), { timeout: 60000 });
  await sleep(1200);
}

async function shot(page, lang, name) {
  await sleep(500);
  await page.screenshot({ path: out("docs/public/screenshots", lang, name + ".png") });
  console.log(`✓ docs/public/screenshots/${lang}/${name}.png`);
}

async function appShots() {
  if (!fs.existsSync(path.join(ROOT, "apps/web/dist/index.html"))) throw new Error("Build the web app first (pnpm --filter @openrisksim/web build)");
  const server = await serve();
  try {
    for (const lang of ["es", "en"]) {
      const L = LABELS[lang];
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
      await page.evaluateOnNewDocument((lang) => {
        localStorage.setItem("openrisksim.locale", lang);
        localStorage.setItem("openrisksim.theme", "dark");
      }, lang);
      await page.goto("http://localhost:4179/", { waitUntil: "networkidle0" });
      await sleep(800);

      // 1. overview + forecast window
      await openExample(page, L, L.project);
      await run(page, L);
      await shot(page, lang, "overview");
      await shot(page, lang, "forecast");

      // 1b. simulation settings → acceleration section
      await click(page, L.settings);
      await sleep(2500); // capability detection (GPU adapter, model compilation)
      await page.evaluate((heading) => {
        const d = [...document.querySelectorAll("[role=dialog]")].pop();
        const h = [...d.querySelectorAll("h3,h4,legend,div,span")].find((e) => e.children.length === 0 && e.textContent.trim() === heading);
        h?.scrollIntoView({ block: "start" });
      }, L.accelHeading);
      await sleep(500);
      await shot(page, lang, "acceleration");
      await closeModals(page);

      // 2. define assumption dialog (on the unit price cell)
      await page.evaluate(() => {
        const nb = document.querySelector('input[aria-label="Cuadro de nombres"], input[aria-label="Name box"]');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setter.call(nb, "B6");
        nb.dispatchEvent(new Event("input", { bubbles: true }));
        nb.focus();
      });
      await page.keyboard.press("Enter");
      await sleep(300);
      await click(page, L.defineAssumption);
      await sleep(600);
      await shot(page, lang, "assumption");
      await closeModals(page);

      // 3. tornado
      await click(page, L.analysis);
      await click(page, L.tornado);
      await sleep(400);
      await page.evaluate(() => {
        const d = [...document.querySelectorAll("[role=dialog]")].pop();
        [...d.querySelectorAll("button")].find((b) => b.className.includes("bg-blue-700"))?.click();
      });
      await sleep(1500);
      await shot(page, lang, "tornado");
      await closeModals(page);

      // 4. distribution fitting on the simulated NPV
      await click(page, L.analysis);
      await click(page, L.fitting);
      await sleep(400);
      await page.evaluate(() => {
        const d = [...document.querySelectorAll("[role=dialog]")].pop();
        [...d.querySelectorAll("[role=radio]")].pop()?.click(); // "from forecast"
      });
      await sleep(300);
      await page.evaluate(() => {
        const d = [...document.querySelectorAll("[role=dialog]")].pop();
        const s = [...d.querySelectorAll("select")].find((s) => s.options.length > 1);
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
        setter.call(s, s.options[1].value);
        s.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await sleep(300);
      await click(page, L.fit, { within: "[role=dialog]:last-of-type" });
      await sleep(3500);
      await shot(page, lang, "fitting");
      await closeModals(page);

      // 5. time series on a synthetic monthly sales series
      await click(page, L.forecast);
      await click(page, L.timeseries);
      await sleep(400);
      await click(page, L.paste, { within: "[role=dialog]", exact: false }).catch(() => {});
      const series = Array.from({ length: 48 }, (_, i) => Math.round(1200 + 18 * i + 260 * Math.sin((2 * Math.PI * i) / 12) + 70 * Math.sin(i * 1.7))).join("\n");
      await setTextarea(page, series);
      await click(page, L.forecastRun, { within: "[role=dialog]:last-of-type" });
      await sleep(4000);
      await shot(page, lang, "timeseries");
      await closeModals(page);

      // 6. project evaluator (default inputs)
      await click(page, L.finance);
      await click(page, L.evaluator);
      await sleep(800);
      await page.evaluate(() => {
        const d = [...document.querySelectorAll("[role=dialog]")].pop();
        const body = d.querySelector(".overflow-auto");
        if (body) body.scrollTop = 330;
      });
      await sleep(500);
      await shot(page, lang, "project");
      await closeModals(page);

      // 7. optimization on the inventory example
      await openExample(page, L, L.inventory);
      await click(page, L.optimization);
      await click(page, L.optim, { within: ".ors-ribbon, header, body", nth: 1 }).catch(() => click(page, L.optim));
      await sleep(600);
      await selectOptionByText(page, L.stochastic);
      await setField(page, L.maxEval, 40);
      await setField(page, L.trials, 400).catch(() => {});
      await click(page, L.optimize, { within: "[role=dialog]:last-of-type" });
      await page.waitForFunction(() => {
        const d = [...document.querySelectorAll("[role=dialog]")].pop();
        return d && /Solución encontrada|Solution found|No se encontró|No feasible/i.test(d.innerText);
      }, { timeout: 180000 }).catch(() => console.warn("optimization did not finish in time"));
      await sleep(800);
      await shot(page, lang, "optimization");
      await closeModals(page);
      await ctx.close();
    }
  } finally {
    server.kill();
  }
}

try {
  if (!ONLY || ONLY === "icons") await icons();
  if (!ONLY || ONLY === "banner") await banners();
  if (!ONLY || ONLY === "app") await appShots();
} finally {
  await browser.close();
}
