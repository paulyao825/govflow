// Tiny i18n helper shared by server and client. English is the default.
export type Lang = "en" | "zh";
export const DEFAULT_LANG: Lang = "en";
export const asLang = (x: unknown): Lang => (x === "zh" ? "zh" : "en");
/** Pick the string for the current language. */
export const L = (lang: Lang, zh: string, en: string) => (lang === "zh" ? zh : en);
