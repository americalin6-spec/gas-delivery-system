"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type AppTheme = "dark" | "light";

const ThemeContext = createContext<AppTheme>("dark");

export function useTheme(): AppTheme {
  return useContext(ThemeContext);
}

type ThemeProviderProps = {
  children: ReactNode;
};

/**
 * Minimal theme host for hydration isolation testing (CRM default: dark).
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme] = useState<AppTheme>("dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
