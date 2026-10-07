import { defineConfig, type DefaultTheme } from "vitepress";

const APP_URL = "https://fernandevdaza.github.io/openrisksim/";
const REPO_URL = "https://github.com/fernandevdaza/openrisksim";

// ---------------------------------------------------------------------------------------------
// Spanish (root locale)
// ---------------------------------------------------------------------------------------------

const navEs: DefaultTheme.NavItem[] = [
  { text: "Guía", link: "/guia/introduccion", activeMatch: "^/guia/" },
  { text: "Tutorial", link: "/tutorial/evaluacion-de-proyecto", activeMatch: "^/tutorial/" },
  { text: "Herramientas", link: "/herramientas/analiticas", activeMatch: "^/herramientas/" },
  { text: "Referencia", link: "/referencia/distribuciones", activeMatch: "^/referencia/" },
  { text: "Desarrolladores", link: "/desarrolladores/arquitectura", activeMatch: "^/desarrolladores/" },
  { text: "Abrir la app", link: APP_URL, target: "_self" },
];

const sidebarEs: DefaultTheme.Sidebar = [
  {
    text: "Primeros pasos",
    items: [
      { text: "Introducción al análisis de riesgo", link: "/guia/introduccion" },
      { text: "Instalación y privacidad", link: "/guia/instalacion" },
      { text: "Inicio rápido (5 minutos)", link: "/guia/inicio-rapido" },
      { text: "La interfaz", link: "/guia/interfaz" },
      { text: "Fórmulas", link: "/guia/formulas" },
      { text: "Archivos: abrir, guardar, exportar", link: "/guia/archivos" },
    ],
  },
  {
    text: "Modelo de riesgo",
    items: [
      { text: "Supuestos", link: "/guia/supuestos" },
      { text: "Pronósticos y decisiones", link: "/guia/pronosticos-y-decisiones" },
      { text: "Correlaciones", link: "/guia/correlaciones" },
      { text: "Ejecutar la simulación", link: "/guia/ejecutar" },
      { text: "Aceleración (multinúcleo y GPU)", link: "/guia/aceleracion" },
      { text: "Interpretar los resultados", link: "/guia/resultados" },
    ],
  },
  {
    text: "Tutorial",
    items: [{ text: "Evaluación de un proyecto paso a paso", link: "/tutorial/evaluacion-de-proyecto" }],
  },
  {
    text: "Herramientas",
    items: [
      { text: "Herramientas analíticas", link: "/herramientas/analiticas" },
      { text: "Pronóstico", link: "/herramientas/pronostico" },
      { text: "Optimización", link: "/herramientas/optimizacion" },
      { text: "Finanzas", link: "/herramientas/finanzas" },
    ],
  },
  {
    text: "Referencia",
    items: [
      { text: "Distribuciones", link: "/referencia/distribuciones" },
      { text: "Equivalencias con Risk Simulator", link: "/referencia/risk-simulator" },
      { text: "Atajos de teclado", link: "/referencia/atajos" },
      { text: "Preguntas frecuentes", link: "/referencia/preguntas-frecuentes" },
      { text: "Glosario", link: "/referencia/glosario" },
    ],
  },
  {
    text: "Desarrolladores",
    collapsed: true,
    items: [
      { text: "Arquitectura", link: "/desarrolladores/arquitectura" },
      { text: "Cómo contribuir", link: "/desarrolladores/contribuir" },
      { text: "Motor numérico", link: "/desarrolladores/motor-numerico" },
    ],
  },
];

// ---------------------------------------------------------------------------------------------
// English (/en/)
// ---------------------------------------------------------------------------------------------

const navEn: DefaultTheme.NavItem[] = [
  { text: "Guide", link: "/en/guide/introduction", activeMatch: "^/en/guide/" },
  { text: "Tutorial", link: "/en/tutorial/project-evaluation", activeMatch: "^/en/tutorial/" },
  { text: "Tools", link: "/en/tools/analytics", activeMatch: "^/en/tools/" },
  { text: "Reference", link: "/en/reference/distributions", activeMatch: "^/en/reference/" },
  { text: "Developers", link: "/en/developers/architecture", activeMatch: "^/en/developers/" },
  { text: "Open the app", link: APP_URL, target: "_self" },
];

const sidebarEn: DefaultTheme.Sidebar = [
  {
    text: "Getting started",
    items: [
      { text: "Introduction to risk analysis", link: "/en/guide/introduction" },
      { text: "Installation & privacy", link: "/en/guide/installation" },
      { text: "Quick start (5 minutes)", link: "/en/guide/quick-start" },
      { text: "The interface", link: "/en/guide/interface" },
      { text: "Formulas", link: "/en/guide/formulas" },
      { text: "Files: open, save, export", link: "/en/guide/files" },
    ],
  },
  {
    text: "Risk model",
    items: [
      { text: "Assumptions", link: "/en/guide/assumptions" },
      { text: "Forecasts & decisions", link: "/en/guide/forecasts-and-decisions" },
      { text: "Correlations", link: "/en/guide/correlations" },
      { text: "Running the simulation", link: "/en/guide/running" },
      { text: "Acceleration (multicore & GPU)", link: "/en/guide/acceleration" },
      { text: "Interpreting results", link: "/en/guide/results" },
    ],
  },
  {
    text: "Tutorial",
    items: [{ text: "Project evaluation, step by step", link: "/en/tutorial/project-evaluation" }],
  },
  {
    text: "Tools",
    items: [
      { text: "Analytical tools", link: "/en/tools/analytics" },
      { text: "Forecasting", link: "/en/tools/forecasting" },
      { text: "Optimization", link: "/en/tools/optimization" },
      { text: "Finance", link: "/en/tools/finance" },
    ],
  },
  {
    text: "Reference",
    items: [
      { text: "Distributions", link: "/en/reference/distributions" },
      { text: "Risk Simulator equivalents", link: "/en/reference/risk-simulator" },
      { text: "Keyboard shortcuts", link: "/en/reference/shortcuts" },
      { text: "FAQ", link: "/en/reference/faq" },
      { text: "Glossary", link: "/en/reference/glossary" },
    ],
  },
  {
    text: "Developers",
    collapsed: true,
    items: [
      { text: "Architecture", link: "/en/developers/architecture" },
      { text: "Contributing", link: "/en/developers/contributing" },
      { text: "Numerical engine", link: "/en/developers/numerical-engine" },
    ],
  },
];

export default defineConfig({
  base: "/openrisksim/docs/",
  title: "OpenRiskSim",
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ["**/README.md"],
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/openrisksim/docs/icon.svg" }],
    ["meta", { name: "theme-color", content: "#05070b" }],
  ],
  // Only the published web app (outside this site) and local dev URLs are allowed to "look dead".
  ignoreDeadLinks: [/^https?:\/\/localhost/, /fernandevdaza\.github\.io\/openrisksim\/?$/],

  themeConfig: {
    logo: "/icon.svg",
    siteTitle: "OpenRiskSim",
    // Spanish and English pages use different slugs, so the language switcher goes to the locale home.
    i18nRouting: false,
    socialLinks: [{ icon: "github", link: REPO_URL }],
    search: {
      provider: "local",
      options: {
        locales: {
          root: {
            translations: {
              button: { buttonText: "Buscar", buttonAriaLabel: "Buscar" },
              modal: {
                displayDetails: "Mostrar detalles",
                resetButtonTitle: "Borrar búsqueda",
                backButtonTitle: "Cerrar búsqueda",
                noResultsText: "Sin resultados para",
                footer: { selectText: "seleccionar", navigateText: "navegar", closeText: "cerrar" },
              },
            },
          },
        },
      },
    },
  },

  locales: {
    root: {
      label: "Español",
      lang: "es",
      description: "Documentación de OpenRiskSim: simulación Monte Carlo, pronósticos, optimización y evaluación de proyectos en el navegador.",
      themeConfig: {
        nav: navEs,
        sidebar: sidebarEs,
        editLink: { pattern: `${REPO_URL}/edit/main/docs/:path`, text: "Editar esta página en GitHub" },
        footer: { message: "Publicado bajo licencia GPL-3.0 · © 2026 Fernando Daza y colaboradores" },
        outline: { label: "En esta página", level: [2, 3] },
        docFooter: { prev: "Anterior", next: "Siguiente" },
        lastUpdated: { text: "Última actualización" },
        darkModeSwitchLabel: "Apariencia",
        lightModeSwitchTitle: "Cambiar a tema claro",
        darkModeSwitchTitle: "Cambiar a tema oscuro",
        sidebarMenuLabel: "Menú",
        returnToTopLabel: "Volver arriba",
        langMenuLabel: "Cambiar idioma",
        notFound: {
          title: "PÁGINA NO ENCONTRADA",
          quote: "La página que buscas no existe o fue movida.",
          linkLabel: "ir al inicio",
          linkText: "Volver al inicio",
        },
      },
    },
    en: {
      label: "English",
      lang: "en",
      link: "/en/",
      description: "OpenRiskSim documentation: Monte Carlo simulation, forecasting, optimization and project evaluation in your browser.",
      themeConfig: {
        nav: navEn,
        sidebar: sidebarEn,
        editLink: { pattern: `${REPO_URL}/edit/main/docs/:path`, text: "Edit this page on GitHub" },
        footer: { message: "Released under the GPL-3.0 license · © 2026 Fernando Daza and contributors" },
        outline: { level: [2, 3] },
      },
    },
  },
});
