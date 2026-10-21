import type { ToolResult } from "@sontx/simplink-core/browser";

export function readToolResult(
  result: ToolResult,
): ToolResult & { warning?: string } {
  const warning = result.content.match(
    /^\[KB has \d+ lint error\(s\); results may be incomplete\]\n/,
  )?.[0];
  return warning
    ? {
        ...result,
        content: result.content.slice(warning.length),
        warning: warning.trim(),
      }
    : result;
}
