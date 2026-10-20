import { lintKB, type LintRule } from "./lint.js";
import type { ValidatorExtension } from "./schema.js";
import type { DocSource } from "./source.js";
import { createKBSearch, createMiniSearchEngine, type SearchEngineFactory, type SearchOptions, type SearchResult } from "./search.js";
import { resolveGoal, resolveProcedure, type ResolveOptions, type ResolvedGoal } from "./resolve.js";
import { renderResolvedGoal, type PlanRenderer, type RenderOptions, type RenderResult } from "./render.js";
import type { Issue, KBGraph, KBNode } from "./types.js";

export interface KBStatus { root: string; nodes: number; edges: number; errors: number; warnings: number; }
export interface KBExtensions {
  validator?: ValidatorExtension;
  lint?: { rules?: LintRule[]; disable?: string[] };
  search?: SearchEngineFactory;
  resolve?: Pick<ResolveOptions, "availability" | "rank" | "maxDepth" | "tenant">;
  renderer?: PlanRenderer;
}
export interface KB {
  graph: KBGraph;
  issues: Issue[];
  status: KBStatus;
  node(id: string): KBNode | undefined;
  search(query: string, opts?: SearchOptions): Promise<SearchResult>;
  resolveGoal(id: string, opts?: ResolveOptions): ResolvedGoal;
  resolveProcedure(id: string, opts?: ResolveOptions): ResolvedGoal;
  render(resolved: ResolvedGoal, opts?: RenderOptions): Promise<RenderResult>;
}
const BRAND = Symbol.for("simplink.kb");
export function isKB(value: unknown): value is KB {
  return typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[BRAND] === true;
}
const defined = <T extends object>(value: T): Partial<T> =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;

/** Create a loaded snapshot. Rebuild it after changing documents or graph data. */
export async function createKB(input: string | DocSource, extensions: KBExtensions = {}): Promise<KB> {
  const { graph, issues, errorCount, warningCount } = await lintKB(input, { ...extensions.lint, validator: extensions.validator });
  const search = createKBSearch(graph, await (extensions.search ?? createMiniSearchEngine)(graph));
  const options = (opts: ResolveOptions = {}): ResolveOptions => {
    const defaults = extensions.resolve ?? {};
    const merged = { ...defaults, ...defined(opts) };
    if (defaults.tenant || opts.tenant) merged.tenant = { ...defined(defaults.tenant ?? {}), ...defined(opts.tenant ?? {}) };
    return merged;
  };
  const kb: KB = {
    graph, issues,
    status: { root: typeof input === "string" ? input : input.name ?? "<source>", nodes: graph.nodes.size, edges: graph.edges.length, errors: errorCount, warnings: warningCount },
    node: id => graph.nodes.get(id),
    search: (query, opts) => search.search(query, opts),
    resolveGoal: (id, opts) => resolveGoal(graph, id, options(opts)),
    resolveProcedure: (id, opts) => resolveProcedure(graph, id, options(opts)),
    render: async (resolved, opts = {}) => (extensions.renderer ?? renderResolvedGoal)(resolved, opts),
  };
  Object.defineProperty(kb, BRAND, { value: true });
  return kb;
}
