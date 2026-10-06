/**
 * Compare a fast backend's outputs against reference (spreadsheet) outputs.
 */

export interface CompareOptions {
  /** Relative tolerance (default 1e-3, suitable for f32 GPU results with `outputCount`; use ~1e-9 for the JS backend). */
  relTol?: number;
  /** Absolute tolerance: differences below it always pass (default 1e-9). */
  absTol?: number;
  /**
   * Optional extension: number of outputs per trial (row-major layout). When given, the relative
   * error of each value is measured against max(|ref|, |cand|, 1% of that output's largest |ref|),
   * so values that happen to be close to zero (an NPV near 0) are not judged by f32 cancellation
   * noise.
   */
  outputCount?: number;
}

export function compareOutputs(
  reference: Float64Array,
  candidate: Float64Array,
  opts: CompareOptions = {},
): { checked: number; maxRelativeError: number; passed: boolean } {
  const relTol = opts.relTol ?? 1e-3;
  const absTol = opts.absTol ?? 1e-9;
  const n = Math.min(reference.length, candidate.length);
  const cols = opts.outputCount && opts.outputCount > 0 ? Math.floor(opts.outputCount) : 0;
  const colFloor: number[] = [];
  if (cols) {
    for (let j = 0; j < cols; j++) colFloor.push(0);
    for (let i = 0; i < n; i++) {
      const a = Math.abs(reference[i]);
      if (Number.isFinite(a) && a > colFloor[i % cols]) colFloor[i % cols] = a;
    }
    for (let j = 0; j < cols; j++) colFloor[j] *= 0.01;
  }
  let maxRel = 0;
  let passed = reference.length === candidate.length;
  for (let i = 0; i < n; i++) {
    const a = reference[i];
    const b = candidate[i];
    const fa = Number.isFinite(a);
    const fb = Number.isFinite(b);
    if (!fa || !fb) {
      if (fa !== fb) {
        passed = false;
        maxRel = Infinity;
      }
      continue;
    }
    const d = Math.abs(a - b);
    if (d <= absTol) continue;
    const scale = Math.max(Math.abs(a), Math.abs(b), cols ? colFloor[i % cols] : 0);
    const rel = scale > 0 ? d / scale : Infinity;
    if (rel > maxRel) maxRel = rel;
    if (rel > relTol) passed = false;
  }
  return { checked: n, maxRelativeError: maxRel, passed };
}
