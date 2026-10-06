# Instalación y privacidad

OpenRiskSim es una **aplicación web**: no necesitas instalar Excel, complementos ni programas. Funciona en cualquier sistema operativo con un navegador moderno (Chrome, Edge, Firefox, Safari, Brave…).

## Usarla en el navegador

Abre <a href="https://fernandevdaza.github.io/openrisksim/" target="_self">fernandevdaza.github.io/openrisksim</a> y listo. La primera vez se descarga la aplicación (unos pocos MB); las siguientes veces carga desde la caché del navegador.

::: tip Pantalla recomendada
La interfaz imita la cinta de opciones de Excel y está pensada para computadoras de escritorio o portátiles. En un teléfono funciona, pero es incómoda.
:::

## Instalarla como aplicación (PWA)

OpenRiskSim es una *Progressive Web App*: puedes instalarla para que tenga su propio ícono, se abra en una ventana aparte y **funcione sin conexión a internet**.

| Navegador | Cómo instalar |
|---|---|
| **Chrome / Edge / Brave** (Windows, macOS, Linux, ChromeOS) | Abre la app y pulsa el ícono de instalar (⊕ o un monitor con flecha) al final de la barra de direcciones, o menú `⋮ → Transmitir, guardar y compartir → Instalar página como aplicación` (en Edge: `… → Aplicaciones → Instalar este sitio como aplicación`). |
| **Safari** (macOS Sonoma o posterior) | Menú `Archivo → Agregar al Dock…`. |
| **Safari** (iPhone / iPad) | Botón Compartir → `Agregar a pantalla de inicio`. |
| **Chrome** (Android) | Menú `⋮ → Instalar aplicación` o `Agregar a la pantalla principal`. |
| **Firefox** | Firefox de escritorio no instala PWA; puedes seguir usándola en una pestaña normal (también funciona sin conexión una vez cargada). |

Cuando se publica una nueva versión, la app se actualiza sola la próxima vez que la abres con conexión.

## Funciona sin conexión

Después de abrirla una vez, todos los archivos de la aplicación quedan guardados en el navegador. Puedes desconectarte de internet y seguir abriendo libros, simulando y exportando informes.

## Privacidad: todo se queda en tu computadora

- Tus archivos **nunca se suben a un servidor**: se leen y se procesan dentro del navegador.
- Los cálculos (fórmulas, simulación, ajuste, optimización) se ejecutan en tu equipo; la simulación usa un *Web Worker* para no congelar la pantalla.
- El trabajo en curso se **guarda automáticamente** en el almacenamiento local del navegador (IndexedDB) para que no lo pierdas si cierras la pestaña. Se restaura al volver a abrir la app. Ver [Archivos → Autoguardado](./archivos#autoguardado).
- No hay cuentas de usuario ni registro.

::: warning El autoguardado no reemplaza a guardar
El almacenamiento del navegador puede borrarse (modo incógnito, limpieza de datos de navegación, otro navegador u otra computadora). Usa siempre `Archivo → Guardar .xlsx` para conservar tu trabajo.
:::

## Ejecutarla desde el código fuente

Si quieres contribuir o usarla en una red sin internet, puedes ejecutarla localmente. Necesitas [Node.js](https://nodejs.org) 20 o superior y pnpm:

```bash
git clone https://github.com/fernandevdaza/openrisksim.git
cd openrisksim
corepack enable          # activa pnpm
pnpm install
pnpm dev                 # abre http://localhost:5173
```

Para generar la versión estática (carpeta `apps/web/dist`, que puedes servir con cualquier servidor web):

```bash
pnpm --filter @openrisksim/web build
```

Más detalles en [Cómo contribuir](../desarrolladores/contribuir).
