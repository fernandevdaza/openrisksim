#!/usr/bin/env node
/**
 * Real-GPU check for @openrisksim/accel.
 *
 *  1. Runs scripts/gpu-prepare.ts through Vitest: compiles every example (+ a synthetic model),
 *     writes the WGSL shader, N sampled inputs and the f64 JS-backend reference outputs.
 *  2. Transpiles src/{ir,wgsl,gpu,compare}.ts to plain ES modules (no bundler needed).
 *  3. Serves everything on http://127.0.0.1 (secure context) and drives the installed Google Chrome
 *     with puppeteer-core (--enable-unsafe-webgpu; headless first, headful fallback), using the real
 *     createGpuRunner() to evaluate N trials per model.
 *  4. Prints f32-vs-f64 errors per output and GPU throughput; exits non-zero on failure.
 *
 * Usage: node packages/accel/scripts/gpu-check.mjs [--trials 1000000] [--headful]
 * Env: CHROME_PATH to override the Chrome executable.
 */
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, "..");
const root = resolve(pkg, "../..");
const require = createRequire(join(root, "package.json"));

const argv = process.argv.slice(2);
const argVal = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};
const TRIALS = Number(argVal("--trials", "1000000"));
const FORCE_HEADFUL = argv.includes("--headful");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const out = mkdtempSync(join(tmpdir(), "accel-gpu-"));
let server;
let browser;
const cleanup = async () => {
  try {
    if (browser) await browser.close();
  } catch {
    /* ignore */
  }
  try {
    server?.close();
  } catch {
    /* ignore */
  }
  rmSync(out, { recursive: true, force: true });
};

try {
  // 1. prepare
  console.log(`[gpu-check] preparing artifacts (${TRIALS} trials per model) in ${out}`);
  const vitestBin = join(root, "node_modules/vitest/vitest.mjs");
  const prep = spawnSync(process.execPath, [vitestBin, "run", "--config", "scripts/vitest.gpu.config.ts"], {
    cwd: pkg,
    env: { ...process.env, ACCEL_GPU_OUT: out, ACCEL_GPU_TRIALS: String(TRIALS) },
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (prep.status !== 0) {
    console.error(prep.stdout, prep.stderr);
    throw new Error("preparation failed");
  }
  const index = JSON.parse(readFileSync(join(out, "index.json"), "utf8"));

  // 2. transpile the browser-side modules
  const ts = require("typescript");
  mkdirSync(join(out, "lib"), { recursive: true });
  for (const f of ["ir", "wgsl", "gpu", "compare"]) {
    const src = readFileSync(join(pkg, "src", `${f}.ts`), "utf8");
    let js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
    js = js.replace(/from "\.\/([a-z]+)"/g, 'from "./$1.js"');
    writeFileSync(join(out, "lib", `${f}.js`), js);
  }
  writeFileSync(join(out, "index.html"), `<!doctype html><meta charset="utf-8"><title>accel gpu check</title><script type="module" src="./run.js"></script>`);
  writeFileSync(join(out, "run.js"), pageScript());

  // 3. serve
  const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".wgsl": "text/plain" };
  server = createServer((req, res) => {
    const p = join(out, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!p.startsWith(out) || !existsSync(p)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(readFileSync(p));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;

  // 4. drive Chrome
  const puppeteer = require("puppeteer-core");
  const launch = (headless) =>
    puppeteer.launch({
      executablePath: CHROME,
      headless,
      protocolTimeout: 900_000,
      userDataDir: join(out, `profile-${headless ? "h" : "w"}`),
      args: ["--enable-unsafe-webgpu", "--enable-webgpu-developer-features", "--no-first-run", "--no-default-browser-check", "--window-size=420,320"],
    });
  const open = async (headless) => {
    browser = await launch(headless);
    const page = await browser.newPage();
    page.on("console", (m) => {
      if (m.type() === "error") console.error("[page]", m.text());
    });
    await page.goto(url);
    await page.waitForFunction("window.accelReady === true", { timeout: 30_000 });
    const info = await page.evaluate("window.detect()");
    return { page, info };
  };
  let mode = FORCE_HEADFUL ? "headful" : "headless";
  let { page, info } = await open(!FORCE_HEADFUL);
  if (!info && !FORCE_HEADFUL) {
    console.log("[gpu-check] WebGPU unavailable in headless Chrome; retrying with a small headful window");
    await browser.close();
    browser = undefined;
    mode = "headful";
    ({ page, info } = await open(false));
  }
  if (!info) throw new Error("WebGPU is not available in Chrome on this machine");
  console.log(`[gpu-check] Chrome ${await browser.version()} (${mode}); adapter: ${JSON.stringify(info)}`);

  const results = await page.evaluate(`window.runAll(${JSON.stringify(index)})`);
  let failed = false;
  for (const r of results) {
    const head = `\n== ${r.id}: ${r.formulaCount} formulas [${r.functions.join(",")}], ${r.trials.toLocaleString()} trials`;
    console.log(head);
    if (r.error) {
      failed = true;
      console.log(`   ERROR: ${r.error}`);
      continue;
    }
    console.log(
      `   GPU ${Math.round(r.gpuTrialsPerSecond).toLocaleString()} trials/s (${r.gpuMs.toFixed(0)} ms incl. upload/readback)` +
        ` | JS f64 ${r.jsTrialsPerSecond.toLocaleString()} trials/s`,
    );
    for (const o of r.outputs) {
      console.log(
        `   ${o.name.padEnd(28)} max rel err ${o.maxRel.toExponential(2)}  p99 ${o.p99.toExponential(2)}  max abs ${o.maxAbs.toExponential(2)}  NaN mismatches ${o.nanMismatch}/${r.validate}`,
      );
    }
    console.log(`   compareOutputs(relTol 1e-3, outputCount): passed=${r.compare.passed} maxRel=${r.compare.maxRelativeError.toExponential(2)}`);
    if (!r.compare.passed) failed = true;
  }
  await cleanup();
  process.exit(failed ? 1 : 0);
} catch (e) {
  console.error("[gpu-check] failed:", e);
  await cleanup();
  process.exit(2);
}

// -------------------------------------------------------------------------------------------
// Browser-side script
// -------------------------------------------------------------------------------------------
function pageScript() {
  return `
import { createGpuRunner, detectGpu } from "./lib/gpu.js";
import { compareOutputs } from "./lib/compare.js";

async function bin(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error("fetch " + path + " " + r.status);
  return r.arrayBuffer();
}

window.detect = () => detectGpu();

window.runAll = async (index) => {
  const results = [];
  for (const c of index) {
    const r = { ...c };
    try {
      const shader = await (await fetch(c.id + "/shader.wgsl")).text();
      const inputs = new Float64Array(await bin(c.id + "/inputs.f64"));
      const ref = new Float64Array(await bin(c.id + "/ref.f64"));
      const program = {
        inputCount: c.inputCount,
        outputCount: c.outputCount,
        formulaCount: c.formulaCount,
        functionsUsed: c.functions,
        gpuSupport: { ok: true },
        toWGSL: () => shader,
      };
      const runner = await createGpuRunner(program);
      // warm-up (pipeline + buffers)
      await runner.evaluate(inputs.subarray(0, 10000 * c.inputCount), 10000);
      const t0 = performance.now();
      let chunks = 0;
      const out = await runner.evaluate(inputs, c.trials, { onProgress: () => chunks++ });
      r.gpuMs = performance.now() - t0;
      r.gpuTrialsPerSecond = c.trials / (r.gpuMs / 1000);
      r.chunks = chunks;
      runner.dispose();
      const k = c.outputCount;
      const cand = out.subarray(0, c.validate * k);
      r.compare = compareOutputs(ref, cand, { relTol: 1e-3, outputCount: k });
      r.outputs = c.outputs.map((name, j) => {
        let colMax = 0;
        for (let t = 0; t < c.validate; t++) { const a = Math.abs(ref[t * k + j]); if (Number.isFinite(a) && a > colMax) colMax = a; }
        const rels = [];
        let maxAbs = 0, nanMismatch = 0;
        for (let t = 0; t < c.validate; t++) {
          const a = ref[t * k + j], b = cand[t * k + j];
          if (Number.isNaN(a) || Number.isNaN(b)) { if (Number.isNaN(a) !== Number.isNaN(b)) nanMismatch++; continue; }
          const d = Math.abs(a - b);
          if (d > maxAbs) maxAbs = d;
          rels.push(d / Math.max(Math.abs(a), Math.abs(b), 0.01 * colMax, 1e-12));
        }
        rels.sort((x, y) => x - y);
        return { name, maxRel: rels.length ? rels[rels.length - 1] : 0, p99: rels.length ? rels[Math.floor(rels.length * 0.99)] : 0, maxAbs, nanMismatch };
      });
    } catch (e) {
      r.error = String(e && e.message || e);
    }
    results.push(r);
  }
  return results;
};

window.accelReady = true;
`;
}
