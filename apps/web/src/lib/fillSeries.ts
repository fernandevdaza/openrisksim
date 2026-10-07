/**
 * Fill-handle series detection (Excel AutoFill): two or more numbers extend as a linear trend,
 * "Año 1"-style texts increment their trailing number; anything else (single numbers, formulas,
 * plain text, booleans) is copied.
 */
export type FillValue = number | string | boolean | null;

function clean(n: number): number {
  return Number(n.toPrecision(15));
}

/** Least-squares line through (i, y_i). */
function linear(ys: number[]): { a: number; b: number } {
  const n = ys.length;
  const mx = (n - 1) / 2;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  ys.forEach((y, i) => {
    sxy += (i - mx) * (y - my);
    sxx += (i - mx) * (i - mx);
  });
  const b = sxx ? sxy / sxx : 0;
  return { a: my - b * mx, b };
}

/**
 * Generator for a source line (values in fill direction). `index` is relative to the first source
 * cell: `len, len+1…` when filling forward, `-1, -2…` when filling backward. Null = copy the pattern.
 */
export function seriesGenerator(line: FillValue[]): ((index: number) => FillValue) | null {
  if (!line.length) return null;
  if (line.every((v) => typeof v === "number")) {
    if (line.length < 2) return null;
    const { a, b } = linear(line as number[]);
    return (i) => clean(a + b * i);
  }
  if (line.every((v) => typeof v === "string")) {
    const texts = (line as string[]).map((s) => (s.startsWith("'") ? s.slice(1) : s));
    if (texts.some((s) => s.startsWith("="))) return null;
    const parts = texts.map((s) => /^(.*?)(\d+)$/.exec(s));
    if (parts.some((m) => !m)) return null;
    const prefix = parts[0]![1];
    if (!prefix || parts.some((m) => m![1] !== prefix)) return null;
    const nums = parts.map((m) => Number(m![2]));
    const { a, b } = nums.length === 1 ? { a: nums[0], b: 1 } : linear(nums);
    return (i) => `'${prefix}${Math.abs(Math.round(a + b * i))}`;
  }
  return null;
}

export type FillDirection = "down" | "up" | "right" | "left";

/**
 * Direction and size of a fill-handle drag: the axis where the pointer went furthest outside the
 * source range wins (Excel). Returns null while the pointer is inside the source.
 */
export function fillExtent(
  src: { r0: number; c0: number; r1: number; c1: number },
  p: { row: number; col: number },
): { dir: FillDirection; count: number } | null {
  const down = p.row - src.r1;
  const up = src.r0 - p.row;
  const right = p.col - src.c1;
  const left = src.c0 - p.col;
  const v = Math.max(down, up);
  const h = Math.max(right, left);
  if (v <= 0 && h <= 0) return null;
  if (v >= h) return down > 0 ? { dir: "down", count: down } : { dir: "up", count: up };
  return right > 0 ? { dir: "right", count: right } : { dir: "left", count: left };
}

/** Target bounds (cells to write) of a fill. */
export function fillTarget(src: { r0: number; c0: number; r1: number; c1: number }, dir: FillDirection, count: number) {
  switch (dir) {
    case "down":
      return { r0: src.r1 + 1, r1: src.r1 + count, c0: src.c0, c1: src.c1 };
    case "up":
      return { r0: src.r0 - count, r1: src.r0 - 1, c0: src.c0, c1: src.c1 };
    case "right":
      return { r0: src.r0, r1: src.r1, c0: src.c1 + 1, c1: src.c1 + count };
    case "left":
      return { r0: src.r0, r1: src.r1, c0: src.c0 - count, c1: src.c0 - 1 };
  }
}
