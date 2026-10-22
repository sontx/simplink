import React, {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  resolvePreferences,
  translate,
  type Language,
  type Theme,
} from "../lib/i18n.js";
import { label } from "../lib/utils.js";
import { enumDescription } from "../lib/enum-description.js";

function messages(language: Language) {
  return {
    t: (message: string, values?: Record<string, string | number>) =>
      translate(language, message, values),
    label: (value: string) => label(value, language),
    enumDescription: (value: string, context?: "issue") =>
      enumDescription(value, context, language),
  };
}

const PreferencesContext = createContext<
  ReturnType<typeof messages> & {
    language: Language;
    theme: Theme;
    setLanguage: (language: Language) => void;
    setTheme: (theme: Theme) => void;
  }
>({
  ...messages("en"),
  language: "en",
  theme: "light",
  setLanguage: () => {},
  setTheme: () => {},
});

export const usePreferences = () => useContext(PreferencesContext);

function initialPreferences() {
  let saved: { language?: string | null; theme?: string | null } = {};
  try {
    saved = {
      language: localStorage.getItem("simplink-language"),
      theme: localStorage.getItem("simplink-theme"),
    };
  } catch {
    /* Preferences still work when browser storage is unavailable. */
  }
  return resolvePreferences(saved, navigator.language);
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const { language, theme } = preferences;
  useLayoutEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [language, theme]);
  const value = useMemo(() => {
    const save = (key: "language" | "theme", value: Language | Theme) => {
      setPreferences((current) => ({ ...current, [key]: value }));
      try {
        localStorage.setItem(`simplink-${key}`, value);
      } catch {
        /* Keep the in-memory selection when persistence is blocked. */
      }
    };
    return {
      ...messages(language),
      language,
      theme,
      setLanguage: (value: Language) => save("language", value),
      setTheme: (value: Theme) => save("theme", value),
    };
  }, [language, theme]);
  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}
