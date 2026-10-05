/**
 * Spreadsheet files carry font colours chosen for a white page. On the dark theme a dark colour
 * (e.g. the classic blue input font or near-black text) becomes unreadable, so it is lightened
 * while keeping its hue. Returns undefined for "use the theme's default text colour".
 */
export function readableOnTheme(color: string | undefined, dark: boolean): string | undefined {
  if (!color || !dark) return color;
  const rgb = parseHex(color);
  if (!rgb) return color;
  const [r, g, b] = rgb;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum >= 0.45) return color;
  // Near-greys: just use the default text colour.
  if (Math.max(r, g, b) - Math.min(r, g, b) < 40) return undefined;
  const mix = (c: number) => Math.round(c + (255 - c) * 0.55);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function parseHex(color: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color.trim());
  if (!m) return null;
  const hex = m[1].length === 8 ? m[1].slice(2) : m[1]; // ARGB from xlsx
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}
