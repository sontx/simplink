import { loadDocs, type RawDoc } from "./loader.js";
import { createValidator } from "./schema.js";
import { buildGraph } from "./graph.js";
import { lintGraph } from "./lint-graph.js";
import { FOLDER_TO_TYPE, issue, type Issue, type KBGraph, type KBNode } from "./types.js";

export interface LintResult {
  graph: KBGraph;
  issues: Issue[];
  errorCount: number;
  warningCount: number;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

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
      av && typeof av === "object" ? { plans: av.plans ? strings(av.plans) : undefined, permissions: av.permissions ? strings(av.permissions) : undefined } : undefined,
    data: d,
    body: doc.body,
  };
}

/**
 * Loads the KB, validates every file, builds the graph, and runs graph lint.
 * Files that fail path or YAML checks are excluded from the graph; files with
 * schema errors are still included so graph rules can report on them.
 */
export async function lintKB(root: string): Promise<LintResult> {
  const validate = createValidator();
  const issues: Issue[] = [];
  const nodes = new Map<string, KBNode>();

  for (const doc of await loadDocs(root)) {
    const add = (code: string, msg: string) => issues.push(issue(code, doc.relPath, msg));
    if (!doc.folderType) {
      add("E003", `not inside a type folder (${Object.keys(FOLDER_TO_TYPE).join(", ")})`);
      continue;
    }
    if (!doc.derivedId) {
      add("E004", "path does not form a valid id (use lowercase kebab-case, no dots in names)");
      continue;
    }
    if (doc.parseError) {
      add("E013", `frontmatter: ${doc.parseError}`);
      continue;
    }
    if (doc.data.type !== doc.folderType)
      add("E003", `type "${String(doc.data.type)}" does not match folder type "${doc.folderType}"`);
    if (doc.data.id !== undefined && doc.data.id !== doc.derivedId)
      add("E002", `id "${String(doc.data.id)}" does not match path-derived id "${doc.derivedId}"`);
    for (const f of validate(doc.folderType, doc.data)) add(f.code, f.message);

    const existing = nodes.get(doc.derivedId);
    if (existing) {
      add("E001", `duplicate id "${doc.derivedId}" (also ${existing.path})`);
      continue;
    }
    nodes.set(doc.derivedId, toNode(doc, doc.derivedId));
  }

  const graph = buildGraph(nodes);
  issues.push(...lintGraph(graph));
  issues.sort(
    (a, b) => a.path.localeCompare(b.path) || (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) || a.code.localeCompare(b.code),
  );

  const errorCount = issues.filter((i) => i.severity === "error").length;
  return { graph, issues, errorCount, warningCount: issues.length - errorCount };
}
