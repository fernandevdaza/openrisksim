import { describe, expect, it } from "vitest";
import { barRankOption, breakEvenOption, columnOption, correlogramOption, fanChartOption, forecastBandOption, heatColor, histogramOption, lineOption, npvProfileOption, PALETTE_LIGHT, tornadoOption } from "./charts";

type AnySeries = { type: string; name?: string; data: unknown[]; stack?: string; stackStrategy?: string };
const seriesOf = (o: unknown) => (o as { series: AnySeries[] }).series;

describe("heatColor", () => {
  it("diverges around zero and is sequential otherwise", () => {
    expect(heatColor(-10, -10, 10).bg).not.toBe(heatColor(10, -10, 10).bg);
    expect(heatColor(0, -10, 10).bg).toBe("#f0efec");
    expect(heatColor(10, 0, 10).fg).toBe("#ffffff");
    expect(heatColor(0, 0, 10).fg).toBe("#0b0b0b");
    expect(heatColor(NaN, 0, 1).bg).toBe("transparent");
  });
});

describe("option builders", () => {
  it("histogram keeps true bin edges and overlays", () => {
    const o = histogramOption({
      bins: [
        { from: 0, to: 1, value: 0.2 },
        { from: 1, to: 2, value: 0.8 },
      ],
      overlays: [{ name: "pdf", x: [0, 1, 2], y: [0.1, 0.5, 0.2] }],
      markers: [{ value: 1, label: "media" }],
      barName: "datos",
      locale: "es",
    });
    const s = seriesOf(o);
    expect(s[0].type).toBe("custom");
    expect(s[0].data).toEqual([
      [0, 1, 0.2],
      [1, 2, 0.8],
    ]);
    expect(s[1].data).toEqual([
      [0, 0.1],
      [1, 0.5],
      [2, 0.2],
    ]);
    expect((o as { xAxis: { min: number; max: number } }).xAxis.max).toBe(2);
  });

  it("tornado draws bars from the base, largest swing on top", () => {
    const o = tornadoOption({ names: ["A", "B"], outputAtLow: [80, 95], outputAtHigh: [130, 104], base: 100, lowLabel: "lo", highLabel: "hi", baseLabel: "base", locale: "es" });
    const s = seriesOf(o);
    expect(s[0].data).toEqual([
      [0, 95],
      [1, 80],
    ]);
    expect(s[1].data).toEqual([
      [0, 104],
      [1, 130],
    ]);
    expect(s[2].data).toEqual([[100, 0]]);
    expect((o as { yAxis: { data: string[] } }).yAxis.data).toEqual(["B", "A"]);
  });

  it("forecast bands stack across sign changes", () => {
    const o = forecastBandOption({
      actual: [1, 2, 3],
      fitted: [NaN, 2, 3],
      forecast: [4, 5],
      lower80: [-1, 0],
      upper80: [6, 7],
      lower95: [-2, -1],
      upper95: [8, 9],
      labels: { actual: "a", fitted: "f", forecast: "fc", band80: "80", band95: "95", period: "t" },
      locale: "en",
    });
    const s = seriesOf(o);
    expect(s.every((x) => !x.stack || x.stackStrategy === "all")).toBe(true);
    const width95 = s[1].data;
    expect(width95).toEqual([null, null, null, 10, 10]);
    const fc = s.find((x) => x.name === "fc")!;
    expect(fc.data).toEqual([null, null, 3, 4, 5]);
    expect(s.find((x) => x.name === "f")!.data[0]).toBeNull();
  });

  it("fan chart, lines, bars and NPV profile build", () => {
    const fan = fanChartOption({
      x: ["0", "1"],
      bands: [{ lower: [1, 0], upper: [1, 3], label: "90" }],
      median: [1, 1.5],
      samplePaths: [[1, 2]],
      labels: { median: "m", paths: "p", time: "t", value: "v" },
      locale: "es",
    });
    expect(seriesOf(fan).length).toBe(4);
    const line = lineOption({ xType: "value", series: [{ name: "a", data: [1, 2], x: [10, 20] }], locale: "es" });
    expect(seriesOf(line)[0].data).toEqual([
      [10, 1],
      [20, 2],
    ]);
    const bars = barRankOption({ categories: ["a", "b"], values: [0.5, -0.2], name: "r", signed: true, locale: "es" });
    expect((bars as { yAxis: { data: string[] } }).yAxis.data).toEqual(["b", "a"]);
    const npv = npvProfileOption({ points: [{ rate: 0, npv: 10 }], irrs: [0.2], discountRate: 0.1, labels: { npv: "VAN", rate: "r", irr: "TIR", discount: "d" }, locale: "es" });
    expect(seriesOf(npv)[0].data).toEqual([[0, 10]]);
    const cols = columnOption({ categories: [1, 2], series: [{ name: "x", data: [1, -1] }], signed: true, locale: "es" });
    expect(seriesOf(cols)[0].data.length).toBe(2);
    const acf = correlogramOption({ values: [0.9, 0.1], n: 100, name: "ACF", lagLabel: "lag", locale: "es" });
    expect(((seriesOf(acf)[0].data[0] as { itemStyle: { color: string } }).itemStyle.color)).toBe(PALETTE_LIGHT[0]);
    const be = breakEvenOption({ fixedCosts: 100, price: 10, variableCost: 5, breakEvenUnits: 20, labels: { revenue: "r", totalCost: "c", fixedCost: "f", units: "u", amount: "a", breakEven: "b" }, locale: "es" });
    expect(seriesOf(be).length).toBe(3);
  });
});
