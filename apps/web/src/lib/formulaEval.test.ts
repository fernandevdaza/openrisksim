import { describe, expect, it } from "vitest";
import { evaluationSteps, formatEvalValue } from "./formulaEval";

describe("evaluate formula", () => {
  const values: Record<string, unknown> = {
    B1: 0.1,
    "C2:C3": [[100], [200]],
    "NPV(B1,C2:C3)": 256.198347107438,
    "B1*2": 0.2,
    "NPV(B1,C2:C3)+B1*2": 256.398347107438,
    "ROUND(NPV(B1,C2:C3),2)": 256.2,
    "ROUND(NPV(B1,C2:C3),2)+1": 257.2,
  };
  const ev = (e: string) => (e in values ? values[e] : { error: "#NAME?" }) as never;

  it("replaces references, then calls (innermost first), then shows the result", () => {
    const steps = evaluationSteps("=ROUND(NPV(B1,C2:C3),2)+1", ev, "es").map((s) => s.text);
    expect(steps).toEqual([
      "=REDONDEAR(VNA(B1;C2:C3);2)+1",
      "=REDONDEAR(VNA(0,1;{100; 200});2)+1",
      "=REDONDEAR(256,1983471;2)+1",
      "=256,2+1",
      "=257,2",
    ]);
  });

  it("marks the part that changed and formats values", () => {
    const steps = evaluationSteps("=NPV(B1,C2:C3)+B1*2", ev, "en");
    expect(steps.map((s) => s.text)).toEqual(["=NPV(B1,C2:C3)+B1*2", "=NPV(0.1,{100, 200})+0.1*2", "=256.1983471+0.1*2", "=256.3983471"]);
    expect(steps[2].changed).toEqual([1, 12]);
    expect(formatEvalValue("a\"b", "es")).toBe('"a""b"');
    expect(formatEvalValue(true, "es")).toBe("VERDADERO");
    expect(formatEvalValue({ error: "#DIV/0!" }, "es")).toBe("#¡DIV/0!");
  });
});
