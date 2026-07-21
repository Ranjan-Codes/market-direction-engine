import { THEME_KEYWORDS } from "../../config/feeds";

/** Keyword-based macro-theme tagging over headline + summary text. */
export function tagThemes(text: string): string[] {
  const lower = text.toLowerCase();
  const themes: string[] = [];
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) themes.push(theme);
  }
  return themes;
}
