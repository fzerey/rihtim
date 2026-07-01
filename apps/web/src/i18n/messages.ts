import en from "./locales/en.json";
import tr from "./locales/tr.json";
import de from "./locales/de.json";
import fr from "./locales/fr.json";
import es from "./locales/es.json";
import it from "./locales/it.json";
import pt from "./locales/pt.json";
import ru from "./locales/ru.json";
import zh from "./locales/zh.json";
import ja from "./locales/ja.json";

export type Locale = "en" | "tr" | "de" | "fr" | "es" | "it" | "pt" | "ru" | "zh" | "ja";

export const LOCALES: Locale[] = ["en", "tr", "de", "fr", "es", "it", "pt", "ru", "zh", "ja"];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  tr: "Türkçe",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  it: "Italiano",
  pt: "Português",
  ru: "Русский",
  zh: "中文",
  ja: "日本語",
};

export const messages: Record<Locale, any> = {
  en,
  tr,
  de,
  fr,
  es,
  it,
  pt,
  ru,
  zh,
  ja,
};
