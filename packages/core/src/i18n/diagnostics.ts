import type { Messages } from "./messages.js";

type DiagnosticKey = keyof Messages["diagnostics"];

/**
 * Matchers for the canonical English diagnostics produced by the resolver (see `en.diagnostics`).
 * Grouped availability reasons come before their per-node forms.
 */
const patterns: [DiagnosticKey, RegExp][] = [
  ["missingProcedure", /^(\S+) references missing procedure "(.*)"$/],
  ["missingNode", /^(\S+) references missing node "(.*)"$/],
  ["cycle", /^cycle detected at (\S+); skipped$/],
  ["maxDepth", /^max depth reached at (\S+); skipped$/],
  ["noSatisfier", /^(\S+) has no resolvable satisfied_by procedure$/],
  ["noChoiceOption", /^choice "(.*)" has no option "(.*)"; showing all$/],
  ["noAvailableOption", /^no available option for choice "(.*)"$/],
  ["requiresPlanGrouped", /^requires plan: (.+) \(([^()]*)\)$/],
  ["requiresPermissionGrouped", /^requires permission: (.+) \(([^()]*)\)$/],
  ["requiresPlan", /^(\S+) requires plan: (.+)$/],
  ["requiresPermission", /^(\S+) requires permission: (.+)$/],
  ["unreachable", /^unreachable node "(.*)"$/],
  ["availabilityNotChecked", /^availability of (\S+) not checked$/],
];

/** How each diagnostic argument is turned into reader text: a node ID, a comma-separated ID list, or plain text. */
const argKinds: Partial<Record<DiagnosticKey, ("id" | "ids" | "text")[]>> = {
  missingProcedure: ["id", "id"],
  missingNode: ["id", "id"],
  cycle: ["id"],
  maxDepth: ["id"],
  noSatisfier: ["id"],
  requiresPlanGrouped: ["text", "ids"],
  requiresPermissionGrouped: ["text", "ids"],
  requiresPlan: ["id"],
  requiresPermission: ["id"],
  unreachable: ["id"],
  availabilityNotChecked: ["id"],
};

/**
 * Words a canonical English resolver diagnostic for docs readers, replacing node IDs with links.
 * @param text - Diagnostic as stored in resolution results.
 * @param messages - Target language messages.
 * @param link - Formats a node ID as reader-facing Markdown.
 * @returns The reader wording, or the original text when it is not a known diagnostic.
 */
export function readerDiagnostic(
  text: string,
  messages: Messages,
  link: (id: string) => string,
): string {
  for (const [key, pattern] of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const kinds = argKinds[key] ?? [];
    const args = match.slice(1).map((arg, i) =>
      kinds[i] === "id"
        ? link(arg)
        : kinds[i] === "ids"
          ? arg
              .split(", ")
              .map((id) => link(id))
              .join(", ")
          : arg,
    );
    return (messages.readerDiagnostics[key] as (...a: string[]) => string)(
      ...args,
    );
  }
  return text;
}

/**
 * Translates a canonical English resolver warning or unavailability reason.
 * @param text - Diagnostic as stored in resolution results.
 * @param messages - Target language messages.
 * @returns The translated diagnostic, or the original text when it is not a known diagnostic.
 */
export function translateDiagnostic(text: string, messages: Messages): string {
  for (const [key, pattern] of patterns) {
    const match = pattern.exec(text);
    if (match)
      return (messages.diagnostics[key] as (...args: string[]) => string)(
        ...match.slice(1),
      );
  }
  return text;
}
