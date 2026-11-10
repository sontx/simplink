import { en } from "./en.js";
import { vi } from "./vi.js";
import type { LocaleOptions, MessageOverrides, Messages } from "./messages.js";

export type {
  DiagnosticMessages,
  LocaleOptions,
  MessageOverrides,
  Messages,
} from "./messages.js";

export { readerDiagnostic, translateDiagnostic } from "./diagnostics.js";

export { en, vi };

/** Languages shipped with Simplink. Add a language by adding `<code>.ts` here and registering it. */
export const builtInLocales: Readonly<Record<string, Messages>> = { en, vi };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Merges `over` into `base` key by key at every depth; functions and arrays replace. */
function deepMerge(
  base: Record<string, unknown>,
  over: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...base };
  for (const [key, value] of Object.entries(over)) {
    if (value === undefined) continue;
    const current = base[key];
    merged[key] =
      isPlainObject(current) && isPlainObject(value)
        ? deepMerge(current, value)
        : value;
  }
  return merged;
}

/**
 * Merges overrides into a complete catalog without mutating either input.
 * Site requirement labels refine severity labels, so an override that rewords a
 * severity without also rewording its requirement label drops the inherited
 * requirement label and the reworded severity is shown instead.
 */
export function mergeMessages(
  base: Messages,
  overrides?: MessageOverrides,
): Messages {
  if (!overrides) return base;
  const merged = deepMerge(
    base as unknown as Record<string, unknown>,
    overrides as Record<string, unknown>,
  ) as unknown as Messages;
  const reworded = Object.keys(overrides.severity ?? {}).filter(
    (key) => overrides.docs?.requirementLabels?.[key] === undefined,
  );
  if (reworded.length) {
    const labels = { ...merged.docs.requirementLabels };
    for (const key of reworded) delete labels[key];
    merged.docs = { ...merged.docs, requirementLabels: labels };
  }
  return merged;
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
