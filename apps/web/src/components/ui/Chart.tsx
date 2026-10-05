import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";

export interface ChartProps {
  option: EChartsOption;
  height?: number | string;
  className?: string;
  /** Called with the chart instance (e.g. to export PNG via getDataURL). */
  onReady?: (chart: echarts.ECharts) => void;
}

/** Thin ECharts wrapper. Follows the app theme (dark class on <html>). */
export function Chart({ option, height = 320, className, onReady }: ChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const dark = document.documentElement.classList.contains("dark");
    const chart = echarts.init(ref.current, dark ? "dark" : undefined, { renderer: "canvas" });
    chartRef.current = chart;
    onReady?.(chart);
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chartRef.current?.setOption({ backgroundColor: "transparent", ...option }, { notMerge: true });
  }, [option]);

  return <div ref={ref} className={className} style={{ width: "100%", height }} />;
}
