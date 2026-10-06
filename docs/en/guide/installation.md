# Installation & privacy

OpenRiskSim is a **web application**: no need to install Excel, add-ins or programs. It runs on any operating system with a modern browser (Chrome, Edge, Firefox, Safari, Brave…).

## Use it in the browser

Open <a href="https://fernandevdaza.github.io/openrisksim/" target="_self">fernandevdaza.github.io/openrisksim</a> and you're done. The first time the app is downloaded (a few MB); afterwards it loads from the browser cache.

::: tip Recommended screen
The interface mimics Excel's ribbon and is designed for desktops and laptops. It works on a phone, but it is cramped.
:::

## Install it as an app (PWA)

OpenRiskSim is a *Progressive Web App*: you can install it so it gets its own icon, opens in its own window and **works offline**.

| Browser | How to install |
|---|---|
| **Chrome / Edge / Brave** (Windows, macOS, Linux, ChromeOS) | Open the app and click the install icon (⊕ or a monitor with an arrow) at the end of the address bar, or menu `⋮ → Cast, save and share → Install page as app` (Edge: `… → Apps → Install this site as an app`). |
| **Safari** (macOS Sonoma or later) | Menu `File → Add to Dock…`. |
| **Safari** (iPhone / iPad) | Share button → `Add to Home Screen`. |
| **Chrome** (Android) | Menu `⋮ → Install app` or `Add to Home screen`. |
| **Firefox** | Desktop Firefox doesn't install PWAs; keep using it in a regular tab (it also works offline once loaded). |

When a new version is published, the app updates itself the next time you open it online.

## Works offline

After opening it once, all the application files are stored in the browser. You can disconnect and keep opening workbooks, simulating and exporting reports.

## Privacy: everything stays on your computer

- Your files are **never uploaded to a server**: they are read and processed inside the browser.
- All computations (formulas, simulation, fitting, optimization) run on your machine; the simulation uses a *Web Worker* so the screen doesn't freeze.
- Work in progress is **saved automatically** in the browser's local storage (IndexedDB) so you don't lose it if you close the tab. It is restored when you reopen the app. See [Files → Autosave](./files#autosave).
- There are no user accounts or sign-ups.

::: warning Autosave is not a substitute for saving
Browser storage can be cleared (private mode, clearing browsing data, another browser or computer). Always use `File → Save .xlsx` to keep your work.
:::

## Run it from source

To contribute or use it on a network without internet, you can run it locally. You need [Node.js](https://nodejs.org) 20+ and pnpm:

```bash
git clone https://github.com/fernandevdaza/openrisksim.git
cd openrisksim
corepack enable          # enables pnpm
pnpm install
pnpm dev                 # opens http://localhost:5173
```

To build the static version (folder `apps/web/dist`, which any web server can serve):

```bash
pnpm --filter @openrisksim/web build
```

More in [Contributing](../developers/contributing).
