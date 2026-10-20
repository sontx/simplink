import type { KBExtensions } from "../kb.js";
/**
 * Output callbacks and KB extensions for embedding CLI runners.
 */
export interface CliContext {
  /** Receives normal output; defaults to console.log. */
  stdout?: (line: string) => void;
  /** Receives diagnostics; defaults to console.error. */
  stderr?: (line: string) => void;
  /** KB customization used by the runner. */
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
