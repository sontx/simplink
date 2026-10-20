import type { KBExtensions } from "../kb.js";
export interface CliContext {
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  extensions?: KBExtensions;
}
export function integerOption(
  value: string | undefined,
  name: string,
  minimum: number,
): number {
  const n = Number(value);
  if (
    !value?.trim() ||
    !Number.isFinite(n) ||
    !Number.isInteger(n) ||
    n < minimum
  )
    throw new Error(`--${name} expects an integer >= ${minimum}`);
  return n;
}
export function formatOption(
  value: string | undefined,
  formats: string[],
): void {
  if (!formats.includes(value ?? ""))
    throw new Error(`--format expects ${formats.join("|")}`);
}
