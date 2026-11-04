export { cn } from "cn";
import { NODE_TYPES } from "@sontx/simplink-core/browser";
import { translate, type Language } from "./i18n.js";

/** Saves a blob through a temporary link. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Groups items by node type in canonical order; unknown types follow, empty groups are dropped. */
export function groupByType<T>(
  items: readonly T[],
  typeOf: (item: T) => string,
): [string, T[]][] {
  const groups = new Map<string, T[]>(NODE_TYPES.map((type) => [type, []]));
  for (const item of items) {
    const type = typeOf(item);
    groups.set(type, [...(groups.get(type) ?? []), item]);
  }
  return [...groups].filter(([, list]) => list.length > 0);
}

const LABELS: Record<string, string> = { id: "ID" };

/** Initialisms that read wrong in sentence case, e.g. `lint-in-ci` → `Lint in CI`. */
const INITIALISMS =
  /\b(?:api|ci|cli|css|html|http|id|json|kb|mcp|md|sdk|ui|url|yaml)\b/g;

/** Display name for enum-like values, e.g. `constrained_by` → `Constrained by`. */
export function label(value: string, language: Language = "en"): string {
  const text = value
    .replace(/[_-]+/g, " ")
    .replace(INITIALISMS, (word) => word.toUpperCase());
  return translate(
    language,
    LABELS[value] ?? text.charAt(0).toUpperCase() + text.slice(1),
  );
}

/** Apple platforms label the command key ⌘; everywhere else it is Ctrl. */
export const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.userAgent);
