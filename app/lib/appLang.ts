export const APP_LANG_STORAGE_KEY = "appLang";

export type AppLang = "zh" | "en";

export function normalizeAppLang(value: string | null | undefined): AppLang {
  return value === "en" ? "en" : "zh";
}

export function readAppLangFromStorage(): AppLang {
  if (typeof window === "undefined") return "zh";
  try {
    return normalizeAppLang(localStorage.getItem(APP_LANG_STORAGE_KEY));
  } catch {
    return "zh";
  }
}

export function writeAppLangToStorage(lang: AppLang): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(APP_LANG_STORAGE_KEY, lang);
  } catch {
    /* ignore quota / private mode */
  }
}

export function toggleAppLang(current: AppLang): AppLang {
  return current === "zh" ? "en" : "zh";
}
