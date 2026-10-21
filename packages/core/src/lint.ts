import { loadDocs, type RawDoc } from "./loader.js";
import type { DocSource } from "./source.js";
import type { MaybePromise } from "./types.js";
import type { ValidatorExtension } from "./schema.js";
import { defaultValidator } from "./platform.js";
import { buildGraph } from "./graph.js";
import { lintGraph } from "./lint-graph.js";
import {
  FOLDER_TO_TYPE,
  issue,
  type Issue,
  type KBGraph,
  type KBNode,
} from "./types.js";

/**
 * An additional graph lint rule returning diagnostics synchronously or asynchronously.
 */
export type LintRule = (graph: KBGraph) => MaybePromise<Issue[]>;

/**
 * Frontmatter validation and graph lint customization.
 */
export interface LintOptions {
  /** Replaces bundled schema validation while preserving path and graph checks. */
  validator?: ValidatorExtension;
  /** Additional graph rules, awaited sequentially after built-in graph linting. */
  rules?: LintRule[];
  /** Diagnostic codes to suppress. Error codes starting with E cannot be disabled. */
  disable?: string[];
}

/**
 * Loaded graph and sorted diagnostics with error and warning totals.
 */
export interface LintResult {
  /** Loaded graph snapshot. */
  graph: KBGraph;
  /** Validation and lint diagnostics. */
  issues: Issue[];
  /** Number of error diagnostics. */
  errorCount: number;
  /** Number of warning diagnostics. */
  warningCount: number;
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

function toNode(doc: RawDoc, id: string): KBNode {
  const d = doc.data;
  const av = d.availability as Record<string, unknown> | undefined;
  return {
    id,
    type: doc.folderType!,
    path: doc.relPath,
    title: typeof d.title === "string" ? d.title : id,
    summary: typeof d.summary === "string" ? d.summary : "",
    aliases: strings(d.aliases),
    tags: strings(d.tags),
    status: d.status === "deprecated" ? "deprecated" : "active",
    availability:
      av && typeof av === "object"
        ? {
            plans: av.plans ? strings(av.plans) : undefined,
            permissions: av.permissions ? strings(av.permissions) : undefined,
          }
        : undefined,
    data: d,
    body: doc.body,
  };
}

/**
 * Loads the KB, validates every file, builds the graph, and runs graph lint.
 * Files that fail path or YAML checks are excluded from the graph; files with
 * schema errors are still included so graph rules can report on them.
 * @param root - Filesystem KB root or custom source.
 * @param opts - Replacement validator, additional rules, and warning suppression.
 * @returns Graph, sorted diagnostics, and severity counts.
 * @throws If loading or an extension fails, or an error code is disabled.
 */
export async function lintKB(
  root: string | DocSource,
  opts: LintOptions = {},
): Promise<LintResult> {
  for (const code of opts.disable ?? []) {
    if (code.startsWith("E"))
      throw new Error(
        `Cannot disable error code ${code}; only warnings may be disabled`,
      );
  }
  const validate = opts.validator ?? defaultValidator();
  const issues: Issue[] = [];
  const nodes = new Map<string, KBNode>();

  for (const doc of await loadDocs(root)) {
    const add = (code: string, msg: string) =>
      issues.push(issue(code, doc.relPath, msg));
    if (!doc.folderType) {
      add(
        "E003",
        `not inside a type folder (${Object.keys(FOLDER_TO_TYPE).join(", ")})`,
      );
      continue;
    }
    if (!doc.derivedId) {
      add(
        "E004",
        "path does not form a valid id (use lowercase kebab-case, no dots in names)",
      );
      continue;
    }
    if (doc.parseError) {
      add("E013", `frontmatter: ${doc.parseError}`);
      continue;
    }
    if (doc.data.type !== doc.folderType)
      add(
        "E003",
        `type "${String(doc.data.type)}" does not match folder type "${doc.folderType}"`,
      );
    if (doc.data.id !== undefined && doc.data.id !== doc.derivedId)
      add(
        "E002",
        `id "${String(doc.data.id)}" does not match path-derived id "${doc.derivedId}"`,
      );
    for (const f of await validate(doc.folderType, doc.data))
      add(f.code, f.message);

    const existing = nodes.get(doc.derivedId);
    if (existing) {
      add("E001", `duplicate id "${doc.derivedId}" (also ${existing.path})`);
      continue;
    }
    nodes.set(doc.derivedId, toNode(doc, doc.derivedId));
  }

  const graph = buildGraph(nodes);
  issues.push(...lintGraph(graph));
  for (const rule of opts.rules ?? []) issues.push(...(await rule(graph)));
  const disabled = new Set(opts.disable);
  for (let i = issues.length - 1; i >= 0; i--)
    if (disabled.has(issues[i].code)) issues.splice(i, 1);
  issues.sort(
    (a, b) =>
      a.path.localeCompare(b.path) ||
      (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) ||
      a.code.localeCompare(b.code),
  );

  const errorCount = issues.filter((i) => i.severity === "error").length;
  return {
    graph,
    issues,
    errorCount,
    warningCount: issues.length - errorCount,
  };
}
