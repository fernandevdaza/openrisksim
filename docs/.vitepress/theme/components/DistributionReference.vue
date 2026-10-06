<script setup lang="ts">
/**
 * Distribution reference generated at build time from the app's own registry
 * (packages/distributions/src/registry.ts → DISTRIBUTION_META), so names, parameter keys,
 * defaults and bilingual descriptions always match the application.
 */
import { computed, ref } from "vue";
import { DISTRIBUTION_META } from "../../../../packages/distributions/src/registry";

const props = defineProps<{ lang: "es" | "en" }>();

type ParamLike = { key: string; label: { es: string; en: string }; default: number; integer?: boolean; min?: number; max?: number; exclusiveMin?: boolean };

const T = {
  es: {
    search: "Filtrar por nombre, uso o parámetro…",
    all: "Todas",
    continuous: "Continuas",
    discrete: "Discretas",
    kindC: "continua",
    kindD: "discreta",
    key: "Clave",
    param: "Parámetro",
    def: "Predeterminado",
    valid: "Valores válidos",
    use: "Uso típico:",
    any: "cualquier número",
    integer: "entero",
    none: "Ninguna distribución coincide con el filtro.",
    customParams: "No tiene parámetros numéricos: se define con una lista de valores y, opcionalmente, sus probabilidades (pesos). Si se omiten los pesos, la distribución es empírica continua (interpola los datos).",
    count: (n: number) => `${n} distribuciones`,
  },
  en: {
    search: "Filter by name, use or parameter…",
    all: "All",
    continuous: "Continuous",
    discrete: "Discrete",
    kindC: "continuous",
    kindD: "discrete",
    key: "Key",
    param: "Parameter",
    def: "Default",
    valid: "Valid values",
    use: "Typical use:",
    any: "any number",
    integer: "integer",
    none: "No distribution matches the filter.",
    customParams: "It has no numeric parameters: it is defined by a list of values and, optionally, their probabilities (weights). Without weights it is a continuous empirical distribution (interpolating the data).",
    count: (n: number) => `${n} distributions`,
  },
};

const tt = computed(() => T[props.lang]);
const query = ref("");
const kind = ref<"all" | "continuous" | "discrete">("all");

function fmt(v: number): string {
  return props.lang === "es" ? String(v).replace(".", ",") : String(v);
}

function constraint(p: ParamLike): string {
  const parts: string[] = [];
  if (p.min != null && p.max != null) parts.push(`${p.exclusiveMin ? "(" : "["}${fmt(p.min)}${props.lang === "es" ? "; " : ", "}${fmt(p.max)}]`);
  else if (p.min != null) parts.push(`${p.exclusiveMin ? ">" : "≥"} ${fmt(p.min)}`);
  else if (p.max != null) parts.push(`≤ ${fmt(p.max)}`);
  if (p.integer) parts.push(tt.value.integer);
  return parts.length ? parts.join(", ") : tt.value.any;
}

const list = computed(() => {
  const q = query.value.trim().toLowerCase();
  return DISTRIBUTION_META.filter((m) => {
    if (kind.value !== "all" && m.kind !== kind.value) return false;
    if (!q) return true;
    const hay = [m.id, m.name.es, m.name.en, m.description[props.lang], m.usage[props.lang], ...m.params.map((p) => p.key + " " + p.label[props.lang])]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
});
</script>

<template>
  <div class="dist-ref">
    <div class="filters">
      <input v-model="query" type="search" :placeholder="tt.search" :aria-label="tt.search" />
      <button :class="{ active: kind === 'all' }" @click="kind = 'all'">{{ tt.all }}</button>
      <button :class="{ active: kind === 'continuous' }" @click="kind = 'continuous'">{{ tt.continuous }}</button>
      <button :class="{ active: kind === 'discrete' }" @click="kind = 'discrete'">{{ tt.discrete }}</button>
    </div>
    <p class="count">{{ tt.count(list.length) }}</p>
    <p v-if="!list.length">{{ tt.none }}</p>
    <section v-for="m in list" :id="'dist-' + m.id" :key="m.id" class="dist-card">
      <div class="dist-head">
        <h3 class="dist-name">{{ m.name[lang] }}</h3>
        <code class="dist-id">{{ m.id }}</code>
        <span class="badge" :class="{ discrete: m.kind === 'discrete' }">{{ m.kind === "continuous" ? tt.kindC : tt.kindD }}</span>
      </div>
      <p>{{ m.description[lang] }}</p>
      <table v-if="m.params.length">
        <thead>
          <tr>
            <th>{{ tt.key }}</th>
            <th>{{ tt.param }}</th>
            <th>{{ tt.def }}</th>
            <th>{{ tt.valid }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in m.params" :key="p.key">
            <td><code>{{ p.key }}</code></td>
            <td>{{ p.label[lang] }}</td>
            <td>{{ fmt(p.default) }}</td>
            <td>{{ constraint(p) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else>{{ tt.customParams }}</p>
      <p><strong>{{ tt.use }}</strong> {{ m.usage[lang] }}</p>
    </section>
  </div>
</template>
