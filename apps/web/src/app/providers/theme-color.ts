import { useTheme } from "next-themes";
import { useEffect } from "react";

// The desk colour per theme; the root head ships both as media-scoped metas for the first paint.
export const THEME_COLOR = { light: "#f0f0eb", dark: "#161616" } as const;

// The head metas only know the OS scheme; an in-app Light or Dark choice repaints the browser chrome too.
export const ThemeColor = () => {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") {
      return;
    }
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.setAttribute("content", THEME_COLOR[resolvedTheme]);
    }
  }, [resolvedTheme]);
  return null;
};
