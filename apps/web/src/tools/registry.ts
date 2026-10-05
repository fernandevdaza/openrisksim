/**
 * Tool registry: every analytical / forecasting / optimization / finance window shown in the ribbon.
 * Components are lazy-loaded (each tool is its own chunk) and wrapped in Suspense here, so the shell
 * can render `component` directly.
 */
import { createElement, lazy, Suspense, type ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Tornado,
  Radar,
  ChartBarDecreasing,
  Grid3x3,
  ChartColumn,
  Shuffle,
  FlaskConical,
  Sigma,
  Layers,
  ChartLine,
  ChartScatter,
  Waves,
  Target,
  Briefcase,
  Calculator,
  Landmark,
  TrendingDown,
  Percent,
  Scale,
  Split,
} from "lucide-react";
import type { I18nText } from "@openrisksim/core";

export interface ToolDef {
  id: string;
  ribbonTab: "analysis" | "forecast" | "optimization" | "finance";
  label: I18nText;
  icon: LucideIcon;
  component: ComponentType<{ onClose(): void }>;
  size?: "md" | "lg" | "xl";
}

type ToolProps = { onClose(): void };

function lazyTool(load: () => Promise<{ default: ComponentType<ToolProps> }>): ComponentType<ToolProps> {
  const Lazy = lazy(load);
  function LazyTool(props: ToolProps) {
    return createElement(
      Suspense,
      { fallback: createElement("div", { className: "p-6 text-sm text-slate-500" }, "…") },
      createElement(Lazy, props),
    );
  }
  return LazyTool;
}

export const TOOLS: ToolDef[] = [
  // ── Analytical tools ────────────────────────────────────────────────────────────────
  {
    id: "tornado",
    ribbonTab: "analysis",
    label: { es: "Tornado", en: "Tornado" },
    icon: Tornado,
    size: "xl",
    component: lazyTool(() => import("./analysis/TornadoTool").then((m) => ({ default: m.TornadoTool }))),
  },
  {
    id: "spider",
    ribbonTab: "analysis",
    label: { es: "Gráfico araña", en: "Spider chart" },
    icon: Radar,
    size: "xl",
    component: lazyTool(() => import("./analysis/TornadoTool").then((m) => ({ default: m.SpiderTool }))),
  },
  {
    id: "sensitivity",
    ribbonTab: "analysis",
    label: { es: "Sensibilidad", en: "Sensitivity" },
    icon: ChartBarDecreasing,
    size: "xl",
    component: lazyTool(() => import("./analysis/SensitivityTool")),
  },
  {
    id: "scenarioTable",
    ribbonTab: "analysis",
    label: { es: "Tabla de escenarios", en: "Scenario table" },
    icon: Grid3x3,
    size: "xl",
    component: lazyTool(() => import("./analysis/ScenarioTableTool")),
  },
  {
    id: "distributionFitting",
    ribbonTab: "analysis",
    label: { es: "Ajuste de distribuciones", en: "Distribution fitting" },
    icon: ChartColumn,
    size: "xl",
    component: lazyTool(() => import("./analysis/DistributionFitTool")),
  },
  {
    id: "bootstrap",
    ribbonTab: "analysis",
    label: { es: "Bootstrap", en: "Bootstrap" },
    icon: Shuffle,
    size: "lg",
    component: lazyTool(() => import("./analysis/BootstrapTool")),
  },
  {
    id: "hypothesisTest",
    ribbonTab: "analysis",
    label: { es: "Prueba de hipótesis", en: "Hypothesis test" },
    icon: FlaskConical,
    size: "lg",
    component: lazyTool(() => import("./analysis/HypothesisTestTool")),
  },
  {
    id: "descriptiveStats",
    ribbonTab: "analysis",
    label: { es: "Estadística descriptiva", en: "Descriptive statistics" },
    icon: Sigma,
    size: "xl",
    component: lazyTool(() => import("./analysis/DescriptiveStatsTool")),
  },
  {
    id: "overlayChart",
    ribbonTab: "analysis",
    label: { es: "Gráfico superpuesto", en: "Overlay chart" },
    icon: Layers,
    size: "lg",
    component: lazyTool(() => import("./analysis/OverlayChartTool")),
  },
  // ── Forecasting ─────────────────────────────────────────────────────────────────────
  {
    id: "timeSeries",
    ribbonTab: "forecast",
    label: { es: "Series de tiempo", en: "Time series" },
    icon: ChartLine,
    size: "xl",
    component: lazyTool(() => import("./forecast/TimeSeriesTool")),
  },
  {
    id: "regression",
    ribbonTab: "forecast",
    label: { es: "Regresión múltiple", en: "Multiple regression" },
    icon: ChartScatter,
    size: "xl",
    component: lazyTool(() => import("./forecast/RegressionTool")),
  },
  {
    id: "stochasticProcess",
    ribbonTab: "forecast",
    label: { es: "Procesos estocásticos", en: "Stochastic processes" },
    icon: Waves,
    size: "xl",
    component: lazyTool(() => import("./forecast/StochasticProcessTool")),
  },
  // ── Optimization ───────────────────────────────────────────────────────────────────
  {
    id: "optimization",
    ribbonTab: "optimization",
    label: { es: "Optimización", en: "Optimization" },
    icon: Target,
    size: "xl",
    component: lazyTool(() => import("./optimization/OptimizationTool")),
  },
  // ── Finance ─────────────────────────────────────────────────────────────────────────
  {
    id: "projectEvaluator",
    ribbonTab: "finance",
    label: { es: "Evaluador de proyectos", en: "Project evaluator" },
    icon: Briefcase,
    size: "xl",
    component: lazyTool(() => import("./finance/ProjectEvaluatorTool")),
  },
  {
    id: "npvIrr",
    ribbonTab: "finance",
    label: { es: "Calculadora VAN/TIR", en: "NPV/IRR calculator" },
    icon: Calculator,
    size: "lg",
    component: lazyTool(() => import("./finance/NpvIrrTool")),
  },
  {
    id: "loan",
    ribbonTab: "finance",
    label: { es: "Amortización de préstamos", en: "Loan amortization" },
    icon: Landmark,
    size: "xl",
    component: lazyTool(() => import("./finance/LoanTool")),
  },
  {
    id: "depreciation",
    ribbonTab: "finance",
    label: { es: "Depreciación", en: "Depreciation" },
    icon: TrendingDown,
    size: "lg",
    component: lazyTool(() => import("./finance/DepreciationTool")),
  },
  {
    id: "costOfCapital",
    ribbonTab: "finance",
    label: { es: "Costo de capital", en: "Cost of capital" },
    icon: Percent,
    size: "lg",
    component: lazyTool(() => import("./finance/CostOfCapitalTool")),
  },
  {
    id: "breakEven",
    ribbonTab: "finance",
    label: { es: "Punto de equilibrio", en: "Break-even" },
    icon: Scale,
    size: "xl",
    component: lazyTool(() => import("./finance/BreakEvenTool")),
  },
  {
    id: "scenarioAnalysis",
    ribbonTab: "finance",
    label: { es: "Análisis de escenarios", en: "Scenario analysis" },
    icon: Split,
    size: "lg",
    component: lazyTool(() => import("./finance/ScenarioAnalysisTool")),
  },
];

export function getTool(id: string): ToolDef | undefined {
  return TOOLS.find((t) => t.id === id);
}
