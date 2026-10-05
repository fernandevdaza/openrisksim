/** Short unique id for model entities (assumptions, forecasts, ...). */
export function newId(prefix = "id"): string {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rnd}`;
}

/** Canonical "Sheet!A1" key for a cell, used as map key. */
export function cellKey(sheet: string, address: string): string {
  return `${sheet}!${address.replace(/\$/g, "").toUpperCase()}`;
}
