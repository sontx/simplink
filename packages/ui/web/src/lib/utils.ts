export { cn } from "cn";

const LABELS: Record<string, string> = { id: "ID" };

/** Display name for enum-like values, e.g. `constrained_by` → `Constrained by`. */
export function label(value: string): string {
  const text = value.replace(/[_-]+/g, " ");
  return LABELS[value] ?? text.charAt(0).toUpperCase() + text.slice(1);
}
