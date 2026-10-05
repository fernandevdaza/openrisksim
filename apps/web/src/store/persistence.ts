/**
 * Autosave of the current workbook + model to IndexedDB (restored on reload).
 * Every call is defensive: private mode / blocked storage simply disables persistence.
 */
import type { WorkbookData } from "@openrisksim/workbook";
import { useWorkbookStore } from "./workbook";
import { useModelStore } from "./model";

const DB_NAME = "openrisksim";
const STORE = "state";
const KEY = "current";

interface Saved {
  workbook: WorkbookData;
  activeSheet: string;
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no indexedDB"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(value: Saved | null): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    if (value) tx.objectStore(STORE).put(value, KEY);
    else tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadSaved(): Promise<Saved | null> {
  try {
    const db = await openDb();
    const value = await new Promise<Saved | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as Saved | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!value || !value.workbook || !Array.isArray(value.workbook.sheets)) return null;
    return value;
  } catch {
    return null;
  }
}

export async function clearSaved(): Promise<void> {
  try {
    await put(null);
  } catch {
    /* ignore */
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
/** Sheet data captured right before "step" mode modified the assumption cells. */
let preStepSnapshot: WorkbookData | null = null;

export function saveNow(): void {
  try {
    const wb = useWorkbookStore.getState();
    if (!wb.engine) return;
    let workbook: WorkbookData;
    if (wb.stepEvaluator) {
      if (!preStepSnapshot) return;
      workbook = { ...preStepSnapshot, model: useModelStore.getState().model };
    } else workbook = wb.snapshot();
    void put({ workbook, activeSheet: wb.activeSheet, savedAt: Date.now() }).catch(() => undefined);
  } catch (e) {
    console.warn("[OpenRiskSim] autosave failed", e);
  }
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    saveNow();
  }, 800);
}

/** Start autosaving on every edit / model change. Returns an unsubscribe function. */
export function startAutosave(): () => void {
  const u1 = useWorkbookStore.subscribe((s, p) => {
    // entering step mode: the evaluator exists but has not written any trial yet → original values
    if (s.stepEvaluator && !p.stepEvaluator) {
      try {
        preStepSnapshot = s.snapshot({ keepStep: true });
      } catch {
        preStepSnapshot = null;
      }
    }
    if (s.editVersion !== p.editVersion || s.workbook !== p.workbook || s.activeSheet !== p.activeSheet) schedule();
  });
  const u2 = useModelStore.subscribe((s, p) => {
    if (s.model !== p.model) schedule();
  });
  const onHide = (e?: Event) => {
    if ((e?.type === "pagehide" || document.visibilityState === "hidden") && timer) {
      clearTimeout(timer);
      timer = null;
      saveNow();
    }
  };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onHide);
  return () => {
    u1();
    u2();
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", onHide);
  };
}
