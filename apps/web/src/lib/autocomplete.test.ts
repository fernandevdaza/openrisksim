import { describe, expect, it } from "vitest";
import { functionCompletions, rankCompletions, type Completion } from "./autocomplete";

describe("autocomplete", () => {
  it("lists Spanish functions for a Spanish prefix, alphabetically", () => {
    const labels = rankCompletions("SU", functionCompletions("es")).map((c) => c.label);
    expect(labels.slice(0, 7)).toEqual(["SUBTOTALES", "SUMA", "SUMA.CUADRADOS", "SUMA.SERIES", "SUMAPRODUCTO", "SUMAR.SI", "SUMAR.SI.CONJUNTO"]);
    expect(labels).toContain("SUSTITUIR");
    // English names match too (after the Spanish ones)
    const vl = rankCompletions("vlo", functionCompletions("es"));
    expect(vl[0]).toMatchObject({ label: "BUSCARV", en: "VLOOKUP" });
  });

  it("puts exact matches first and ignores accents", () => {
    expect(rankCompletions("si", functionCompletions("es"))[0].label).toBe("SI");
    expect(rankCompletions("ano", functionCompletions("es"))[0].label).toBe("AÑO");
    expect(rankCompletions("npv", functionCompletions("en"))[0].label).toBe("NPV");
  });

  it("includes defined names and catalog descriptions", () => {
    const names: Completion[] = [{ kind: "name", label: "Tasa_descuento", en: "Tasa_descuento" }];
    const r = rankCompletions("TAS", [...functionCompletions("es"), ...names]);
    expect(r.map((c) => c.label)).toEqual(expect.arrayContaining(["TASA", "TASA.NOMINAL", "Tasa_descuento"]));
    expect(r.find((c) => c.label === "TASA")?.desc?.es).toMatch(/tasa/i);
    expect(rankCompletions("", functionCompletions("es"))).toEqual([]);
  });
});
