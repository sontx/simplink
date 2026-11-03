import type { Issue } from "@sontx/simplink-core";

export interface FileIssues<N> {
  path: string;
  node?: N;
  issues: Issue[];
  errors: number;
  warnings: number;
}

/**
 * Groups issues by file in fix order: files with the most errors first, then
 * the most warnings, then by path. Within a file, errors precede warnings.
 */
export function groupIssuesByFile<N extends { path: string }>(
  issues: readonly Issue[],
  nodes: readonly N[],
): FileIssues<N>[] {
  const groups = new Map<string, FileIssues<N>>();
  for (const issue of issues) {
    let group = groups.get(issue.path);
    if (!group) {
      group = {
        path: issue.path,
        node: nodes.find((node) => node.path === issue.path),
        issues: [],
        errors: 0,
        warnings: 0,
      };
      groups.set(issue.path, group);
    }
    group.issues.push(issue);
    if (issue.severity === "error") group.errors++;
    else group.warnings++;
  }
  for (const group of groups.values())
    group.issues.sort(
      (a, b) =>
        Number(b.severity === "error") - Number(a.severity === "error") ||
        a.code.localeCompare(b.code),
    );
  return [...groups.values()].sort(
    (a, b) =>
      b.errors - a.errors ||
      b.warnings - a.warnings ||
      a.path.localeCompare(b.path),
  );
}

/** The next file with issues that has an editable node, wrapping around. */
export function nextFileWithIssues<N extends { path: string }>(
  groups: readonly FileIssues<N>[],
  currentPath: string,
): { next?: FileIssues<N>; position: number; total: number } {
  const fixable = groups.filter((group) => group.node);
  const index = fixable.findIndex((group) => group.path === currentPath);
  const candidates =
    index < 0
      ? fixable
      : [...fixable.slice(index + 1), ...fixable.slice(0, index)];
  return {
    next: candidates[0],
    position: index + 1,
    total: fixable.length,
  };
}
