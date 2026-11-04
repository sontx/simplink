import { en } from "./en.js";
import { vi } from "./vi.js";
import type { LocaleOptions, MessageOverrides, Messages } from "./messages.js";

export type { LocaleOptions, MessageOverrides, Messages } from "./messages.js";

export { translateDiagnostic } from "./diagnostics.js";

export { en, vi };

/** Languages shipped with Simplink. Add a language by adding `<code>.ts` here and registering it. */
export const builtInLocales: Readonly<Record<string, Messages>> = { en, vi };

/** Merges overrides into a complete catalog without mutating either input. */
export function mergeMessages(
  base: Messages,
  overrides?: MessageOverrides,
): Messages {
  if (!overrides) return base;
  const merged = { ...base } as Record<string, unknown>;
  for (const [group, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    const current = (base as unknown as Record<string, unknown>)[group];
    merged[group] =
      current && typeof current === "object" && typeof value === "object"
        ? { ...current, ...value }
        : value;
  }
  return merged as unknown as Messages;
}

/** Lowercased candidates from most to least specific, e.g. `vi-vn`, `vi`. */
function candidates(locale: string): string[] {
  const tag = locale.trim().toLowerCase().replaceAll("_", "-");
  const primary = tag.split("-")[0];
  return tag && tag !== primary ? [tag, primary] : tag ? [tag] : [];
}

function pick<T>(
  table: Readonly<Record<string, T>> | undefined,
  locale: string,
): T | undefined {
  if (!table) return undefined;
  const lowered = new Map(
    Object.entries(table).map(([key, value]) => [key.toLowerCase(), value]),
  );
  for (const key of candidates(locale)) {
    const hit = lowered.get(key);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Selects messages for a language tag, falling back to English for unknown tags and missing keys.
 * @param locale - BCP 47 tag such as `vi` or `vi-VN`; English when omitted.
 * @param custom - Extra or replacement languages keyed by tag; merged over the built-in language.
 * @returns A complete message catalog.
 */
export function resolveMessages(
  locale?: string,
  custom?: Readonly<Record<string, MessageOverrides>>,
): Messages {
  if (!locale) return mergeMessages(en, pick(custom, "en"));
  return mergeMessages(
    mergeMessages(en, pick(builtInLocales, locale)),
    pick(custom, locale),
  );
}

/** Messages for per-call locale options. */
export const messagesFor = (opts: LocaleOptions = {}): Messages =>
  mergeMessages(resolveMessages(opts.locale), opts.messages);
