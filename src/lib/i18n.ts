// Tiny i18n helper shared by server and client. English is the default.
export type Lang = "en" | "zh";
export const DEFAULT_LANG: Lang = "en";
export const asLang = (x: unknown): Lang => (x === "zh" ? "zh" : "en");
/** Pick the string for the current language. */
export const L = (lang: Lang, zh: string, en: string) => (lang === "zh" ? zh : en);

/** Text stored in both languages, so switching the UI language re-renders past agent output too. */
export type Bi = { zh: string; en: string };
export type Txt = string | Bi;
export const bi = (zh: string, en: string): Bi => ({ zh, en });
export const pick = (t: Txt | undefined | null, lang: Lang): string => (t == null ? "" : typeof t === "string" ? t : t[lang] ?? t.en ?? t.zh ?? "");
export const joinBi = (list: Txt[], sepZh = "\n", sepEn = "\n"): Bi => bi(list.map((x) => pick(x, "zh")).join(sepZh), list.map((x) => pick(x, "en")).join(sepEn));
