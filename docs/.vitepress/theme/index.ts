import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./custom.css";

export default {
  extends: DefaultTheme,
} satisfies Theme;
