import { useEffect, useRef, useSyncExternalStore } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";

export interface ChartProps {
  option: EChartsOption;
  height?: number | string;
  className?: string;
  /** Called with the chart instance (e.g. to export PNG via getDataURL). Called again if the theme changes (new instance). */
  onReady?: (chart: echarts.ECharts) => void;
}

function subscribeDark(cb: () => void): () => void {
  if (typeof MutationObserver === "undefined" || typeof document === "undefined") return () => {};
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => mo.disconnect();
}
const isDark = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark");

/** Thin ECharts wrapper. Follows the app theme (dark class on <html>). */
export function Chart({ option, height = 320, className, onReady }: ChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const optionRef = useRef(option);
  optionRef.current = option;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const dark = useSyncExternalStore(subscribeDark, isDark, () => false);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, dark ? "dark" : undefined, { renderer: "canvas" });
    chartRef.current = chart;
    chart.setOption({ backgroundColor: "transparent", ...optionRef.current }, { notMerge: true });
    onReadyRef.current?.(chart);
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [dark]);

  useEffect(() => {
    chartRef.current?.setOption({ backgroundColor: "transparent", ...option }, { notMerge: true });
  }, [option]);

  return <div ref={ref} className={className} style={{ width: "100%", height }} />;
}
