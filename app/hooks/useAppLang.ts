"use client";

import { useCallback, useState } from "react";
import {
  type AppLang,
  readAppLangFromStorage,
  toggleAppLang,
  writeAppLangToStorage,
} from "../lib/appLang";

export function useAppLang() {
  const [lang, setLangState] = useState<AppLang>(() => {
    if (typeof window === "undefined") return "zh";
    return readAppLangFromStorage();
  });

  const setLang = useCallback((next: AppLang) => {
    setLangState(next);
    writeAppLangToStorage(next);
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => {
      const next = toggleAppLang(prev);
      writeAppLangToStorage(next);
      return next;
    });
  }, []);

  return { lang, setLang, toggleLang };
}
