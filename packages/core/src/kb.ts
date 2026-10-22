import { lintKB, type LintRule } from "./lint.js";
import { exportDocs, type DocPage, type DocsOptions } from "./docs.js";
import type { ValidatorExtension } from "./schema.js";
import type { DocSource } from "./source.js";
import {
  createKBSearch,
  createMiniSearchEngine,
  type SearchEngineFactory,
  type SearchOptions,
  type SearchResult,
} from "./search.js";
import {
  resolveGoal,
  resolveProcedure,
  type ResolveOptions,
  type ResolvedGoal,
} from "./resolve.js";
import {
  renderResolvedGoal,
  type PlanRenderer,
  type RenderOptions,
  type RenderResult,
} from "./render.js";
import type { Issue, KBGraph, KBNode } from "./types.js";

/**
 * Source label and node, edge, and diagnostic counts for a loaded snapshot.
 */
export interface KBStatus {
  /** Source label or filesystem root used to load the snapshot. */
  root: string;
  /** Number of loaded graph nodes. */
  nodes: number;
  /** Number of graph edges. */
  edges: number;
  /** Number of lint errors at load time. */
  errors: number;
  /** Number of lint warnings at load time. */
  warnings: number;
}

/**
 * Code-configured replacements and defaults used when creating a KB snapshot.
 */
export interface KBExtensions {
  /** Replaces bundled frontmatter validation; path and graph checks still run. */
  validator?: ValidatorExtension;
  /** Additional graph rules and warning codes to suppress. */
  lint?: { rules?: LintRule[]; disable?: string[] };
  /** Creates the snapshot search engine; defaults to MiniSearch. */
  search?: SearchEngineFactory;
  /** Default resolution policies and tenant context. Defined per-call values override these defaults; tenant fields are merged. */
  resolve?: Pick<
    ResolveOptions,
    "availability" | "rank" | "maxDepth" | "tenant"
  >;
  /** Replaces the default Markdown plan renderer. */
  renderer?: PlanRenderer;
}

/**
 * Loaded KB snapshot with search, resolution, rendering, and documentation helpers. Recreate after document changes.
 */
export interface KB {
  /** Normalized graph snapshot; rebuild the KB after changes. */
  graph: KBGraph;
  /** Sorted validation and lint diagnostics; errors do not prevent snapshot creation. */
  issues: Issue[];
  /** Counts and source label recorded when the snapshot was created. */
  status: KBStatus;
  /** Looks up a node by its full identifier; returns undefined if absent. */
  node(id: string): KBNode | undefined;
  /** Searches the snapshot with optional filters; rejects if the configured engine fails. */
  search(query: string, opts?: SearchOptions): Promise<SearchResult>;
  /** Resolves a goal using configured defaults and per-call overrides; throws for a missing or non-goal identifier. */
  resolveGoal(id: string, opts?: ResolveOptions): ResolvedGoal;
  /** Resolves one procedure; throws for a missing or non-procedure identifier. */
  resolveProcedure(id: string, opts?: ResolveOptions): ResolvedGoal;
  /** Merges configured resolution defaults with per-call values. */
  resolveOptions(opts?: ResolveOptions): ResolveOptions;
  /** Renders a plan using the configured renderer; synchronous renderers are wrapped in a promise. */
  render(resolved: ResolvedGoal, opts?: RenderOptions): Promise<RenderResult>;
  /** Exports Markdown pages in memory using configured resolution defaults and per-call overrides. */
  docs(opts?: DocsOptions): DocPage[];
}
const BRAND = Symbol.for("simplink.kb");
/**
 * Tests whether a value carries the brand assigned by createKB.
 * @param value - Value to inspect.
 * @returns Whether the value is a branded KB snapshot.
 */
export function isKB(value: unknown): value is KB {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[BRAND] === true
  );
}
const defined = <T extends object>(value: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Partial<T>;

/** Loads and lints documents into a reusable snapshot with search and plan helpers.
 * Rebuild after changing documents or graph data. Lint errors are recorded, not thrown.
 * @param input - Filesystem KB root or custom document source.
 * @param extensions - Validation, lint, search, resolution, and rendering customization.
 * @returns The loaded snapshot, including diagnostics.
 * @throws If loading, extension initialization, or lint configuration fails.
 * @example
 * ```ts
 * const kb = await createKB("./kb");
 * const results = await kb.search("send a message");
 * const goal = results.goals[0];
 * if (goal) {
 *   const plan = kb.resolveGoal(goal.id);
 *   console.log((await kb.render(plan)).text);
 * }
 * ``` */
export async function createKB(
  input: string | DocSource,
  extensions: KBExtensions = {},
): Promise<KB> {
  const { graph, issues, errorCount, warningCount } = await lintKB(input, {
    ...extensions.lint,
    validator: extensions.validator,
  });
  const search = createKBSearch(
    graph,
    await (extensions.search ?? createMiniSearchEngine)(graph),
  );
  const options = (opts: ResolveOptions = {}): ResolveOptions => {
    const defaults = extensions.resolve ?? {};
    const merged = { ...defaults, ...defined(opts) };
    if (defaults.tenant || opts.tenant)
      merged.tenant = {
        ...defined(defaults.tenant ?? {}),
        ...defined(opts.tenant ?? {}),
      };
    return merged;
  };
  const kb: KB = {
    graph,
    issues,
    status: {
      root: typeof input === "string" ? input : (input.name ?? "<source>"),
      nodes: graph.nodes.size,
      edges: graph.edges.length,
      errors: errorCount,
      warnings: warningCount,
    },
    node: (id) => graph.nodes.get(id),
    resolveOptions: options,
    search: (query, opts) => search.search(query, opts),
    resolveGoal: (id, opts) => resolveGoal(graph, id, options(opts)),
    resolveProcedure: (id, opts) => resolveProcedure(graph, id, options(opts)),
    docs: (opts) => exportDocs(graph, { ...opts, ...options(opts) }),
    render: async (resolved, opts = {}) =>
      (extensions.renderer ?? renderResolvedGoal)(resolved, opts),
  };
  Object.defineProperty(kb, BRAND, { value: true });
  return kb;
}
