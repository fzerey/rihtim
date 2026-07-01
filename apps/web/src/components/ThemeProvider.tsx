"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "rihtim.theme";

type Ctx = {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (m: ThemeMode) => void;
};

const ThemeContext = createContext<Ctx | null>(null);

function systemPref(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");
  const [resolved, setResolved] = useState<ResolvedTheme>("dark");

  useEffect(() => {
    const stored = (typeof window !== "undefined" && (localStorage.getItem(STORAGE_KEY) as ThemeMode | null)) || null;
    const initial: ThemeMode = stored ?? "dark";
    setModeState(initial);
    const r: ResolvedTheme = initial === "system" ? systemPref() : initial;
    setResolved(r);
    applyTheme(r);
  }, []);

  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      const r: ResolvedTheme = mq.matches ? "light" : "dark";
      setResolved(r);
      applyTheme(r);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    localStorage.setItem(STORAGE_KEY, m);
    const r: ResolvedTheme = m === "system" ? systemPref() : m;
    setResolved(r);
    applyTheme(r);
  };

  return <ThemeContext.Provider value={{ mode, resolved, setMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

// Inline script string used in <head> to set the theme class before hydration to avoid flashes.
export const themeInitScript = `(() => { try { const s = localStorage.getItem('${STORAGE_KEY}') || 'dark'; const sys = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; const r = s === 'system' ? sys : s; document.documentElement.classList.toggle('dark', r === 'dark'); } catch (e) { document.documentElement.classList.add('dark'); } })();`;
