import { statisticOf } from "./statistics";
import type { ForecastStatistic, OptConstraint } from "./types";

export interface StochasticObjectiveSpec {
  forecastId: string;
  statistic: ForecastStatistic;
  threshold?: number;
}

export interface StochasticConstraintSpec {
  forecastId: string;
  statistic: ForecastStatistic;
  threshold?: number;
  op: "<=" | ">=" | "=";
  rhs: number;
}

/**
 * Builds objective + forecast-based constraints for stochastic optimization.
 * `simulate(x)` runs a full simulation with decision values x and returns forecast values by forecast id.
 * One simulation is shared by the objective and all constraints of a candidate: the statistics needed are
 * computed once per distinct x and cached (only the numbers are kept, not the raw trial arrays).
 * Constraint ids are `"<forecastId>:<statistic>:<index>"`.
 */
export function makeStochasticObjective(
  simulate: (x: number[]) => Promise<Record<string, Float64Array>>,
  spec: StochasticObjectiveSpec,
  constraints: StochasticConstraintSpec[] = [],
): { objective: (x: number[]) => Promise<number>; constraints: OptConstraint[] } {
  const cache = new Map<string, Promise<number[]>>();
  const specs: { forecastId: string; statistic: ForecastStatistic; threshold?: number }[] = [spec, ...constraints];

  const stats = (x: number[]): Promise<number[]> => {
    const key = x.join(",");
    let p = cache.get(key);
    if (!p) {
      p = simulate(x.slice()).then((forecasts) =>
        specs.map((s) => {
          const values = forecasts[s.forecastId];
          if (!values) throw new Error(`Forecast "${s.forecastId}" missing from simulation result`);
          return statisticOf(values, s.statistic, s.threshold);
        }),
      );
      cache.set(key, p);
      // Do not cache failures (e.g. aborted simulations).
      p.catch(() => cache.delete(key));
    }
    return p;
  };

  return {
    objective: async (x) => (await stats(x))[0],
    constraints: constraints.map((c, i) => ({
      id: `${c.forecastId}:${c.statistic}:${i}`,
      label: `${c.statistic}(${c.forecastId}) ${c.op} ${c.rhs}`,
      op: c.op,
      rhs: c.rhs,
      evaluate: async (x: number[]) => (await stats(x))[i + 1],
    })),
  };
}
