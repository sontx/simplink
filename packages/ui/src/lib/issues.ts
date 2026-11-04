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

export interface QueuedIssue<N> {
  file: FileIssues<N>;
  issue: Issue;
  /** The issue's index within its file's sorted issues. */
  index: number;
}

/**
 * Every issue in an editable node, in fix order: files as grouped, then
 * each file's issues. Files without a node cannot be opened, so they are left out.
 */
export function issueQueue<N extends { path: string }>(
  groups: readonly FileIssues<N>[],
): QueuedIssue<N>[] {
  return groups
    .filter((file) => file.node)
    .flatMap((file) =>
      file.issues.map((issue, index) => ({ file, issue, index })),
    );
}

/**
 * The issue after `index` in `path`, wrapping around, with its 1-based
 * position in the queue. From a file not in the queue, the first issue.
 */
export function nextIssue<N extends { path: string }>(
  queue: readonly QueuedIssue<N>[],
  path: string,
  index: number,
): { next?: QueuedIssue<N>; position: number; total: number } {
  const total = queue.length;
  const current = queue.findIndex(
    (item) => item.file.path === path && item.index === index,
  );
  const target =
    current >= 0
      ? (current + 1) % total
      : Math.max(
          0,
          queue.findIndex((item) => item.file.path === path),
        );
  if (!total || (current >= 0 && total === 1)) return { position: 0, total };
  return { next: queue[target], position: target + 1, total };
}

const issueKey = (issue: Issue) => `${issue.code}\u0000${issue.message}`;

/** E013: the frontmatter no longer parses, so the file's other rules did not run. */
export const unparsed = (issues: readonly Issue[]) =>
  issues.some((issue) => issue.code === "E013");

/**
 * Issues present before a save that the re-lint no longer reports. A file
 * that stopped parsing confirms nothing: its other issues were not checked.
 */
export function clearedIssues(
  before: readonly Issue[],
  after: readonly Issue[],
): Issue[] {
  if (unparsed(after)) return [];
  const remaining = new Map<string, number>();
  for (const issue of after)
    remaining.set(issueKey(issue), (remaining.get(issueKey(issue)) ?? 0) + 1);
  return before.filter((issue) => {
    const count = remaining.get(issueKey(issue)) ?? 0;
    if (count) remaining.set(issueKey(issue), count - 1);
    return !count;
  });
}
