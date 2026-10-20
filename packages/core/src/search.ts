import MiniSearch from "minisearch";
import { stripCode } from "./markdown.js";
import { goalsOf } from "./graph.js";
import type { MaybePromise, KBGraph, KBNode, NodeType } from "./types.js";

/** Lowercase, strip combining marks, and fold stroked d characters. */
export const fold = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

/**
 * Common function words, stored folded. Folding can merge distinct words,
 * so the list is kept small.
 */
const STOPWORDS = new Set(
  [
    "a",
    "an",
    "and",
    "are",
    "can",
    "do",
    "for",
    "how",
    "i",
    "in",
    "is",
    "it",
    "me",
    "my",
    "of",
    "on",
    "or",
    "the",
    "to",
    "what",
    "with",
    "la",
    "cua",
    "va",
    "cho",
    "cac",
    "nhung",
    "de",
    "co",
    "khong",
    "toi",
    "minh",
    "lam",
    "sao",
    "the",
    "nao",
    "thi",
    "ma",
    "duoc",
    "nay",
    "voi",
  ].map(fold),
);

/**
 * Default relative field weights used by the MiniSearch engine.
 */
export const FIELD_BOOST = {
  title: 5,
  aliases: 4,
  when_to_use: 4,
  tags: 3,
  idWords: 2,
  summary: 2,
  body: 1,
} as const;

interface Doc {
  id: string;
  type: NodeType;
  status: string;
  title: string;
  summary: string;
  aliases: string;
  when_to_use: string;
  tags: string;
  idWords: string;
  body: string;
}

const strList = (v: unknown) =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string").join(" \n ") : "";

const toDoc = (n: KBNode): Doc => ({
  id: n.id,
  type: n.type,
  status: n.status,
  title: n.title,
  summary: n.summary,
  aliases: n.aliases.join(" \n "),
  when_to_use: strList(n.data.when_to_use),
  tags: n.tags.join(" "),
  // "procedure.zalo.send-message" → "zalo send message" (type prefix dropped)
  idWords: n.id.split(".").slice(1).join(" ").replace(/-/g, " "),
  // Wikilink ids are kept as words; code is dropped.
  body: stripCode(n.body).replace(
    /\[\[([^\]|#]+)[^\]]*\]\]/g,
    (_, id: string) => id.replace(/[.-]/g, " "),
  ),
});

/**
 * Retrieval filters, matching controls, and limits for hits and surfaced goals.
 */
export interface SearchOptions {
  /** Restrict hits to these node types (goal surfacing still works). */
  types?: NodeType[];
  /** Max hits (default 10). */
  limit?: number;
  /** Max surfaced goals (default 5). */
  goalLimit?: number;
  /** Include deprecated nodes (default false). */
  includeDeprecated?: boolean;
  /** Typo tolerance as a fraction of term length, for terms ≥ 5 chars (default 0.2; false disables).
   *  Short terms are exact to avoid noisy matches from small spelling differences. */
  fuzzy?: number | false;
  /** Prefix-match the last query term when ≥ 3 chars (default true). */
  prefix?: boolean;
  /** Drop hits/goals below this relevance (default 0.05). */
  minRelevance?: number;
}

/**
 * A matching node with normalized relevance and related goal identifiers.
 */
export interface SearchHit {
  /** Stable node or definition identifier. */
  id: string;
  /** Document node type. */
  type: NodeType;
  /** Human-readable title. */
  title: string;
  /** Short description of the node. */
  summary: string;
  /** Raw positive retrieval score (BM25 with the default engine). */
  score: number;
  /** score / top hit score, 0..1. */
  relevance: number;
  /** Folded index terms that matched, with the fields they matched in. */
  matched: Record<string, string[]>;
  /** Goals reachable from this node (empty for goals). */
  goals: string[];
}

/**
 * A goal surfaced by a direct match or by graph traversal from matching nodes.
 */
export interface GoalHit {
  /** Stable node or definition identifier. */
  id: string;
  /** Human-readable title. */
  title: string;
  /** Short description of the node. */
  summary: string;
  /** max(direct score, hit score × 0.6^hops) */
  score: number;
  /** score / top hit score (all types), 0..1. Comparable with hit relevance. */
  relevance: number;
  /** Nearest hits that surfaced this goal ("self" for a direct hit), max 5. */
  via: { id: string; hops: number }[];
}

/**
 * Query text, ranked node hits, and ranked goal entry points.
 */
export interface SearchResult {
  /** Original search query. */
  query: string;
  /** Ranked matching nodes. */
  hits: SearchHit[];
  /** Entry points for resolveGoal, ranked. */
  goals: GoalHit[];
}

const HOP_DECAY = 0.6;
const MAX_VIA = 5;

/**
 * Synchronous search over a graph snapshot.
 */
export interface KBSearch {
  /** Returns ranked hits and surfaced goals for the query. */
  search(query: string, opts?: SearchOptions): SearchResult;
  /** Goals reachable from a node, with hop distance. */
  goalsOf(id: string): Map<string, number>;
}

/**
 * Engine candidate with a positive finite score; higher scores indicate stronger matches.
 */
export interface SearchMatch {
  /** Stable node or definition identifier. */
  id: string;
  /** Positive finite retrieval score; larger means a stronger match. */
  score: number;
  /** Matched terms mapped to the fields containing them, if provided by the engine. */
  matched?: Record<string, string[]>;
}

/** Engines should return enough candidates for core filtering and goal aggregation. */
export type EngineSearchOptions = Pick<
  SearchOptions,
  "fuzzy" | "prefix" | "includeDeprecated"
> & { candidateLimit?: number };

/**
 * Retrieval provider; core applies node filtering, relevance normalization, and goal aggregation.
 */
export interface SearchEngine {
  /** Retrieves scored candidates. Return enough matches for core filtering and goal aggregation. */
  search(query: string, opts: EngineSearchOptions): MaybePromise<SearchMatch[]>;
}

/**
 * Creates a retrieval engine for a graph snapshot, synchronously or asynchronously.
 */
export type SearchEngineFactory = (
  graph: KBGraph,
) => MaybePromise<SearchEngine>;

/**
 * Overrides for MiniSearch term normalization, stopwords, and field weights.
 */
export interface MiniSearchEngineOptions {
  /** Replaces the default stopword set; entries are normalized with the configured fold function. */
  stopwords?: ReadonlySet<string>;
  /** Normalizes indexed terms and query terms; defaults to the exported fold function. */
  fold?: (text: string) => string;
  /** Per-field weight overrides merged with FIELD_BOOST. */
  boosts?: Partial<Record<keyof typeof FIELD_BOOST, number>>;
}

/**
 * Asynchronous search facade over a pluggable retrieval engine.
 */
export interface AsyncKBSearch {
  /** Retrieves and ranks results; provider failures reject the promise. */
  search(query: string, opts?: SearchOptions): Promise<SearchResult>;
  /** Returns reachable goal identifiers and their hop distances; treat the cached map as read-only. */
  goalsOf(id: string): Map<string, number>;
}

/**
 * Builds the default in-memory MiniSearch engine over a graph snapshot.
 * @param graph - Documents to index; rebuild after changes.
 * @param opts - Normalization, stopword, and field-weight overrides.
 * @returns A synchronous retrieval engine producing raw scored matches.
 */
export function createMiniSearchEngine(
  graph: KBGraph,
  opts: MiniSearchEngineOptions = {},
): { search(query: string, opts: EngineSearchOptions): SearchMatch[] } {
  const folding = opts.fold ?? fold;
  const stopwords = new Set([...(opts.stopwords ?? STOPWORDS)].map(folding));
  const ms = new MiniSearch<Doc>({
    idField: "id",
    fields: Object.keys(FIELD_BOOST),
    processTerm: (term) => {
      const f = folding(term);
      return f.length < 2 || stopwords.has(f) ? null : f;
    },
  });
  ms.addAll([...graph.nodes.values()].map(toDoc));
  return {
    search(query, options) {
      const fuzzy = options.fuzzy ?? 0.2;
      return ms
        .search(query, {
          boost: { ...FIELD_BOOST, ...opts.boosts },
          combineWith: "OR",
          fuzzy:
            fuzzy === false
              ? false
              : (term) => (term.length >= 5 ? fuzzy : false),
          prefix:
            options.prefix === false
              ? false
              : (term, i, terms) => i === terms.length - 1 && term.length >= 3,
        })
        .map((r) => ({ id: String(r.id), score: r.score, matched: r.match }));
    },
  };
}

/**
 * Filters and ranks engine candidates, then surfaces related goals through graph traversal.
 * @param graph - Graph snapshot used to resolve candidate identifiers.
 * @param query - Original query; blank queries return no results.
 * @param matches - Retrieval candidates; invalid scores and unknown identifiers are discarded.
 * @param opts - Filters, relevance threshold, and result limits.
 * @returns Ranked hits and goal entry points.
 */
export function rankResults(
  graph: KBGraph,
  query: string,
  matches: SearchMatch[],
  opts: SearchOptions = {},
): SearchResult {
  const empty: SearchResult = { query, hits: [], goals: [] };
  if (!query.trim()) return empty;
  const unique = new Map<string, SearchMatch>();
  for (const match of matches) {
    const node = graph.nodes.get(match.id);
    if (
      !node ||
      !Number.isFinite(match.score) ||
      match.score <= 0 ||
      (!opts.includeDeprecated && node.status === "deprecated")
    )
      continue;
    const previous = unique.get(match.id);
    if (!previous || match.score > previous.score) unique.set(match.id, match);
  }
  const raw = [...unique.values()].sort((a, b) => b.score - a.score);
  if (!raw.length) return empty;
  const types = opts.types ? new Set(opts.types) : null;
  // Goals are aggregated from all hits, before type filtering and limits.
  const goalScores = new Map<string, GoalHit>();
  const bump = (
    goalId: string,
    score: number,
    via: { id: string; hops: number },
  ) => {
    const n = graph.nodes.get(goalId)!;
    const g = goalScores.get(goalId) ?? {
      id: goalId,
      title: n.title,
      summary: n.summary,
      score: 0,
      relevance: 0,
      via: [],
    };
    g.score = Math.max(g.score, score);
    g.via.push(via);
    goalScores.set(goalId, g);
  };
  for (const r of raw) {
    const id = String(r.id);
    if (graph.nodes.get(r.id)!.type === "goal")
      bump(id, r.score, { id: "self", hops: 0 });
    else
      for (const [goalId, hops] of goalsOf(graph, id))
        bump(goalId, r.score * HOP_DECAY ** hops, { id, hops });
  }

  const min = opts.minRelevance ?? 0.05;
  const filtered = types
    ? raw.filter((r) => types.has(graph.nodes.get(r.id)!.type))
    : raw;
  const top = filtered[0]?.score ?? 1;
  const hits: SearchHit[] = filtered
    .filter((r) => r.score / top >= min)
    .slice(0, opts.limit ?? 10)
    .map((r) => ({
      id: String(r.id),
      type: graph.nodes.get(r.id)!.type,
      title: graph.nodes.get(r.id)!.title,
      summary: graph.nodes.get(r.id)!.summary,
      score: r.score,
      relevance: r.score / top,
      matched: r.matched ?? {},
      goals:
        graph.nodes.get(r.id)!.type === "goal"
          ? []
          : [...goalsOf(graph, String(r.id)).keys()],
    }));

  const rawTop = raw[0].score;
  const goals = [...goalScores.values()]
    .map((g) => ({
      ...g,
      relevance: g.score / rawTop,
      via: g.via.sort((a, b) => a.hops - b.hops).slice(0, MAX_VIA),
    }))
    .filter((g) => g.relevance >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.goalLimit ?? 5);
  return { query, hits, goals };
}
const engineOptions = (opts: SearchOptions): EngineSearchOptions => ({
  fuzzy: opts.fuzzy,
  prefix: opts.prefix,
  includeDeprecated: opts.includeDeprecated,
});
/**
 * Wraps a retrieval engine with asynchronous ranking and goal surfacing.
 * @param graph - Graph snapshot corresponding to the engine.
 * @param engine - Synchronous or asynchronous retrieval provider.
 * @returns Search facade; engine failures reject search calls.
 */
export function createKBSearch(
  graph: KBGraph,
  engine: SearchEngine,
): AsyncKBSearch {
  return {
    async search(query, opts = {}) {
      return rankResults(
        graph,
        query,
        query.trim() ? await engine.search(query, engineOptions(opts)) : [],
        opts,
      );
    },
    goalsOf: (id) => goalsOf(graph, id),
  };
}

/** Builds a synchronous index over a graph snapshot. Rebuild when the KB changes. */
export function createSearchIndex(
  graph: KBGraph,
  opts?: MiniSearchEngineOptions,
): KBSearch {
  const engine = createMiniSearchEngine(graph, opts);
  return {
    search: (query, options = {}) =>
      rankResults(
        graph,
        query,
        query.trim() ? engine.search(query, engineOptions(options)) : [],
        options,
      ),
    goalsOf: (id) => goalsOf(graph, id),
  };
}
