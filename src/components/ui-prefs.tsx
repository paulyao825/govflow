"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEFAULT_LANG, pick, type Lang, type Txt } from "@/lib/i18n";

// Viewer preferences: language (English default) and theme. Stored per browser.
type Theme = "light" | "dark";
interface Prefs {
  lang: Lang;
  theme: Theme;
  setLang: (l: Lang) => void;
  setTheme: (t: Theme) => void;
  t: (zh: string, en: string) => string;
  /** render stored bilingual text in the current language */
  tx: (v: Txt | undefined | null) => string;
}

let currentLang: Lang = DEFAULT_LANG;
export const getLang = () => currentLang;

const Ctx = createContext<Prefs>({ lang: DEFAULT_LANG, theme: "light", setLang: () => {}, setTheme: () => {}, t: (_zh, en) => en, tx: (v) => pick(v, DEFAULT_LANG) });
export const usePrefs = () => useContext(Ctx);

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
};

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);
  const [theme, setThemeState] = useState<Theme>("light");

  // Hydration-safe: server renders the defaults, the browser applies saved prefs after mount.
  useEffect(() => {
    const l = read("gf-lang");
    /* eslint-disable react-hooks/set-state-in-effect */
    if (l === "zh" || l === "en") setLangState(l);
    setThemeState(document.documentElement.classList.contains("dark") ? "dark" : "light");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    currentLang = lang;
    document.documentElement.lang = lang === "zh" ? "zh-Hant-TW" : "en";
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    write("gf-lang", l);
  }, []);
  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    write("gf-theme", t);
    document.documentElement.classList.toggle("dark", t === "dark");
  }, []);
  const t = useCallback((zh: string, en: string) => (lang === "zh" ? zh : en), [lang]);
  const tx = useCallback((v: Txt | undefined | null) => pick(v, lang), [lang]);

  return <Ctx.Provider value={{ lang, theme, setLang, setTheme, t, tx }}>{children}</Ctx.Provider>;
}

/** Runs before paint to avoid a light flash for dark-mode users. */
export const THEME_BOOT = `try{var t=localStorage.getItem("gf-theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;
