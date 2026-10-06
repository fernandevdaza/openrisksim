// Copies the web build (apps/web/dist) into apps/desktop/app, without the PWA service worker
// (the desktop app is already offline; a service worker would only cache stale versions).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = process.env.WEB_DIST ? path.resolve(process.env.WEB_DIST) : path.resolve(here, "../../web/dist");
const dest = path.resolve(here, "../app");

if (!fs.existsSync(path.join(src, "index.html"))) {
  console.error("apps/web/dist not found — run `pnpm --filter @openrisksim/web build` first.");
  process.exit(1);
}
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, {
  recursive: true,
  filter: (p) => {
    const rel = path.relative(src, p);
    if (rel === "docs" || rel.startsWith("docs" + path.sep)) return false; // docs are online
    if (/^(sw\.js|workbox-[^/]+\.js|registerSW\.js)(\.map)?$/.test(rel)) return false;
    return true;
  },
});
// Neutralise the service-worker registration snippet injected in index.html.
const indexPath = path.join(dest, "index.html");
const html = fs.readFileSync(indexPath, "utf8").replace(/<script[^>]*registerSW\.js[^>]*><\/script>/g, "");
fs.writeFileSync(indexPath, html);
console.log(`✓ web build copied to ${path.relative(process.cwd(), dest)}`);
