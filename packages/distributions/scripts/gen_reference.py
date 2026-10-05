"""Generates src/testdata/scipyReference.ts (reference values for the unit tests).

Run: python3 packages/distributions/scripts/gen_reference.py  (needs scipy + mpmath)
"""
import json, math, os
import numpy as np
from scipy import stats, special
import mpmath as mp

mp.mp.dps = 40
out = {}

# ---- special functions -------------------------------------------------------------------
xs = [-6, -3.5, -1.3, -0.9, -0.5, -0.1, 1e-10, 0.1, 0.3, 0.84, 0.85, 1.0, 1.2, 1.3, 2.0, 2.8, 2.9, 4.5, 5.9, 10, 26.5]
out["erf"] = [[x, float(mp.erf(x))] for x in xs]
out["erfc"] = [[x, float(mp.erfc(x))] for x in xs]
gx = [0.001, 0.1, 0.5, 1, 1.5, 2, 2.5, 3.7, 5, 9.99, 10, 12.3, 50, 171.3, 1000, 1e6, -0.5, -2.5]
out["lnGamma"] = [[x, float(mp.log(abs(mp.gamma(x))))] for x in gx]
out["gamma"] = [[x, float(mp.gamma(x))] for x in [0.1, 0.5, 1.5, 4.2, 5, 10, 20.5, 100.5, -0.5, -1.5]]
out["digamma"] = [[x, float(mp.digamma(x))] for x in [0.1, 0.5, 1, 2.5, 7, 100, -0.5]]
out["trigamma"] = [[x, float(mp.polygamma(1, x))] for x in [0.1, 0.5, 1, 2.5, 7, 100]]
beta_cases = [(0.2, 2, 3), (0.5, 0.5, 0.5), (0.9, 5, 1.5), (0.01, 0.1, 10), (0.999, 10, 0.3), (0.3, 50, 80), (0.45, 500, 600), (0.5, 1e4, 1e4), (1e-5, 2, 2), (0.7, 1, 1)]
out["regIncBeta"] = [[x, a, b, float(special.betainc(a, b, x)), float(special.betaincc(a, b, x))] for (x, a, b) in beta_cases]
gamma_cases = [(0.5, 0.1), (0.5, 3), (1, 1), (3, 0.5), (3, 10), (10, 9), (10, 30), (100, 90), (100, 130), (1e4, 1e4 + 50), (0.01, 1e-4), (5, 1e-3)]
out["regIncGamma"] = [[a, x, float(special.gammainc(a, x)), float(special.gammaincc(a, x))] for (a, x) in gamma_cases]
ps = [1e-300, 1e-100, 1e-20, 1e-12, 1e-6, 0.001, 0.02425, 0.025, 0.1, 0.3, 0.5, 0.7, 0.9, 0.975, 0.999, 1 - 1e-6, 1 - 1e-12]
out["normalQuantile"] = [[p, float(mp.findroot(lambda z: mp.ncdf(z) - mp.mpf(p), float(special.ndtri(p)))) if p < 0.5 else float(-mp.findroot(lambda z: mp.ncdf(z) - (1 - mp.mpf(p)), float(special.ndtri(1 - p))))] for p in ps]
zx = [-38, -30, -20, -10, -5, -2, -1, -0.5, 0, 0.5, 1, 2, 5, 8.2]
out["normalCdf"] = [[x, float(mp.ncdf(x))] for x in zx]
tcases = [(-3, 1), (2.5, 1), (-2, 2), (1.5, 3.5), (-0.3, 5), (2.2, 10), (-6, 4), (40, 3), (0.1, 30), (-1.96, 1e6)]
out["studentTCdf"] = [[t, df, float(stats.t.cdf(t, df))] for (t, df) in tcases]
tq = [(0.975, 1), (0.025, 2), (0.9, 3), (0.995, 5.5), (1e-8, 4), (0.6, 10), (0.4, 0.7), (0.999999, 30), (0.3, 200)]
out["studentTQuantile"] = [[p, df, float(stats.t.ppf(p, df))] for (p, df) in tq]
out["chiSquareCdf"] = [[x, df, float(stats.chi2.cdf(x, df))] for (x, df) in [(1, 1), (3.84, 1), (10, 5), (0.5, 3), (50, 30), (200, 150)]]
out["fCdf"] = [[x, a, b, float(stats.f.cdf(x, a, b))] for (x, a, b) in [(1, 1, 1), (2.5, 3, 10), (0.4, 5, 2), (4, 10, 20), (0.05, 2, 7)]]
inv_beta = [(0.3, 2, 3), (1e-10, 0.5, 0.5), (0.999, 5, 1.5), (0.5, 0.05, 2), (0.9, 200, 300), (1 - 1e-12, 2, 9), (0.001, 0.2, 0.2)]
out["invRegIncBeta"] = [[p, a, b, float(special.betaincinv(a, b, p))] for (p, a, b) in inv_beta]
inv_gamma = [(0.3, 2), (1e-10, 0.5), (0.999, 5), (0.5, 0.05), (0.9, 300), (1 - 1e-12, 3), (0.01, 1e4)]
out["invRegIncGammaP"] = [[p, a, float(special.gammaincinv(a, p))] for (p, a) in inv_gamma]

# ---- families --------------------------------------------------------------------------------
def lognorm_of(m, s):
    s2 = math.log1p((s / m) ** 2)
    return stats.lognorm(s=math.sqrt(s2), scale=math.exp(math.log(m) - s2 / 2))

def pert_of(a, m, b):
    w = b - a
    return stats.beta(1 + 4 * (m - a) / w, 1 + 4 * (b - m) / w, loc=a, scale=w)

fam = [
    ("normal", {"mean": 10, "stdDev": 2}, stats.norm(10, 2)),
    ("lognormal", {"mean": 100, "stdDev": 30}, lognorm_of(100, 30)),
    ("uniform", {"min": -2, "max": 5}, stats.uniform(-2, 7)),
    ("triangular", {"min": 1, "mode": 3, "max": 8}, stats.triang((3 - 1) / 7, loc=1, scale=7)),
    ("pert", {"min": 80, "mode": 100, "max": 130}, pert_of(80, 100, 130)),
    ("beta", {"alpha": 2.5, "beta": 0.8, "min": 10, "max": 20}, stats.beta(2.5, 0.8, loc=10, scale=10)),
    ("gamma", {"shape": 2.5, "scale": 3}, stats.gamma(2.5, scale=3)),
    ("exponential", {"rate": 0.25}, stats.expon(scale=4)),
    ("weibull", {"shape": 1.7, "scale": 50, "location": 5}, stats.weibull_min(1.7, loc=5, scale=50)),
    ("logistic", {"mean": 3, "scale": 1.5}, stats.logistic(3, 1.5)),
    ("studentT", {"df": 4.5, "mean": 1, "scale": 2}, stats.t(4.5, 1, 2)),
    ("chiSquare", {"df": 7}, stats.chi2(7)),
    ("f", {"df1": 5, "df2": 12}, stats.f(5, 12)),
    ("cauchy", {"location": -1, "scale": 0.5}, stats.cauchy(-1, 0.5)),
    ("gumbel", {"location": 20, "scale": 4}, stats.gumbel_r(20, 4)),
    ("frechet", {"shape": 3.5, "scale": 10, "location": 2}, stats.invweibull(3.5, loc=2, scale=10)),
    ("pareto", {"shape": 2.5, "scale": 3}, stats.pareto(2.5, scale=3)),
    ("laplace", {"location": 5, "scale": 2}, stats.laplace(5, 2)),
    ("rayleigh", {"scale": 3}, stats.rayleigh(scale=3)),
    ("erlang", {"k": 4, "rate": 0.5}, stats.erlang(4, scale=2)),
    ("arcsine", {"min": 2, "max": 6}, stats.arcsine(loc=2, scale=4)),
    ("powerFunction", {"alpha": 2.5, "min": 1, "max": 4}, stats.powerlaw(2.5, loc=1, scale=3)),
    ("trapezoidal", {"min": 0, "mode1": 2, "mode2": 5, "max": 10}, stats.trapezoid(0.2, 0.5, loc=0, scale=10)),
    ("bernoulli", {"p": 0.3}, stats.bernoulli(0.3)),
    ("binomial", {"n": 20, "p": 0.35}, stats.binom(20, 0.35)),
    ("poisson", {"lambda": 4.2}, stats.poisson(4.2)),
    ("geometric", {"p": 0.2}, stats.geom(0.2, loc=-1)),
    ("negativeBinomial", {"r": 3, "p": 0.4}, stats.nbinom(3, 0.4)),
    ("hypergeometric", {"population": 50, "successes": 15, "draws": 10}, stats.hypergeom(50, 15, 10)),
    ("discreteUniform", {"min": 1, "max": 6}, stats.randint(1, 7)),
]
families = []
for (fid, params, d) in fam:
    discrete = hasattr(d.dist, "pmf")
    lo = d.ppf(0.01); hi = d.ppf(0.99)
    if discrete:
        xs = sorted(set([int(v) for v in np.linspace(lo, hi, 6)]))
        pdf = [float(d.pmf(x)) for x in xs]
    else:
        xs = [float(v) for v in np.linspace(lo, hi, 6)]
        pdf = [float(d.pdf(x)) for x in xs]
    cdf = [float(d.cdf(x)) for x in xs]
    pp = [0.001, 0.05, 0.3, 0.5, 0.77, 0.95, 0.999]
    q = [float(d.ppf(p)) for p in pp]
    mean, var = d.stats(moments="mv")
    families.append({"id": fid, "params": params, "discrete": discrete, "x": xs, "pdf": pdf, "cdf": cdf, "p": pp, "q": q,
                     "mean": float(mean), "variance": float(var)})
out["families"] = families

path = os.path.join(os.path.dirname(__file__), "..", "src", "testdata", "scipyReference.ts")
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w") as f:
    f.write("// Generated by scripts/gen_reference.py from scipy %s / mpmath %s — do not edit by hand.\n" % (__import__('scipy').__version__, mp.__version__))
    f.write("/* eslint-disable */\n")
    f.write("export const REF = " + json.dumps(out, indent=1) + " as const;\n")
print("wrote", path)
