import MiniSearch, { type SearchResult as MSResult } from "minisearch";
import { stripCode } from "./markdown.js";
import type { EdgeKind, KBGraph, KBNode, NodeType } from "./types.js";

/** Lowercase, strip combining marks, and fold stroked d characters. */
export const fold = (s: string): string =>
  s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/**
 * Common function words, stored folded. Folding can merge distinct words,
 * so the list is kept small.
 */
const STOPWORDS = new Set(
  [
    "a", "an", "and", "are", "can", "do", "for", "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "the", "to", "what", "with",
    "la", "cua", "va", "cho", "cac", "nhung", "de", "co", "khong", "toi", "minh", "lam", "sao", "the", "nao", "thi", "ma", "duoc", "nay", "voi",
  ].map(fold),
);

const processTerm = (term: string): string | null => {
  const f = fold(term);
  return f.length < 2 || STOPWORDS.has(f) ? null : f;
};

export const FIELD_BOOST = {
  title: 5,
  aliases: 4,
  when_to_use: 4,
  tags: 3,
  idWords: 2,
  summary: 2,
  body: 1,
} as const;
type Field = keyof typeof FIELD_BOOST;

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

const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").join(" \n ") : "");

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
  body: stripCode(n.body).replace(/\[\[([^\]|#]+)[^\]]*\]\]/g, (_, id: string) => id.replace(/[.-]/g, " ")),
});

/**
 * Reverse edges walked to surface goals from a non-goal hit.
 * Excludes satisfied_by/produces (fix procedures are not the user's intent) and related (noisy).
 */
const GOAL_PATH_KINDS: ReadonlySet<EdgeKind> = new Set([
  "procedures",
  "requires",
  "choice_option",
  "preconditions",
  "optional_preconditions",
  "uses",
  "constrained_by",
]);

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

export interface SearchHit {
  id: string;
  type: NodeType;
  title: string;
  summary: string;
  /** Raw BM25 score from MiniSearch. */
  score: number;
  /** score / top hit score, 0..1. */
  relevance: number;
  /** Folded index terms that matched, with the fields they matched in. */
  matched: Record<string, string[]>;
  /** Goals reachable from this node (empty for goals). */
  goals: string[];
}

export interface GoalHit {
  id: string;
  title: string;
  summary: string;
  /** max(direct score, hit score × 0.6^hops) */
  score: number;
  /** score / top hit score (all types), 0..1. Comparable with hit relevance. */
  relevance: number;
  /** Nearest hits that surfaced this goal ("self" for a direct hit), max 5. */
  via: { id: string; hops: number }[];
}

export interface SearchResult {
  query: string;
  hits: SearchHit[];
  /** Entry points for resolveGoal, ranked. */
  goals: GoalHit[];
}

const HOP_DECAY = 0.6;
const MAX_VIA = 5;
const MAX_HOPS = 4;

export interface KBSearch {
  search(query: string, opts?: SearchOptions): SearchResult;
  /** Goals reachable from a node, with hop distance. */
  goalsOf(id: string): Map<string, number>;
}

/** Builds an in-memory index over the graph. Rebuild when the KB changes. */
export function createSearchIndex(graph: KBGraph): KBSearch {
  const ms = new MiniSearch<Doc>({
    idField: "id",
    fields: Object.keys(FIELD_BOOST),
    storeFields: ["type", "status", "title", "summary"],
    processTerm,
  });
  ms.addAll([...graph.nodes.values()].map(toDoc));

  const goalCache = new Map<string, Map<string, number>>();
  const goalsOf = (start: string): Map<string, number> => {
    const cached = goalCache.get(start);
    if (cached) return cached;
    const found = new Map<string, number>();
    const seen = new Set([start]);
    let frontier = [start];
    for (let hops = 1; hops <= MAX_HOPS && frontier.length; hops++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const e of graph.in.get(id) ?? []) {
          if (!GOAL_PATH_KINDS.has(e.kind) || seen.has(e.from)) continue;
          seen.add(e.from);
          if (graph.nodes.get(e.from)?.type === "goal") found.set(e.from, hops);
          else next.push(e.from);
        }
      }
      frontier = next;
    }
    goalCache.set(start, found);
    return found;
  };

  const search = (query: string, opts: SearchOptions = {}): SearchResult => {
    const empty: SearchResult = { query, hits: [], goals: [] };
    if (!query.trim()) return empty;

    const fuzzy = opts.fuzzy ?? 0.2;
    const types = opts.types ? new Set(opts.types) : null;
    const raw: MSResult[] = ms.search(query, {
      boost: FIELD_BOOST,
      combineWith: "OR",
      fuzzy: fuzzy === false ? false : (term) => (term.length >= 5 ? fuzzy : false),
      prefix: opts.prefix === false ? false : (term, i, terms) => i === terms.length - 1 && term.length >= 3,
      filter: (r) => opts.includeDeprecated || r.status !== "deprecated",
    });
    if (!raw.length) return empty;

    // Goals are aggregated from all hits, before type filtering and limits.
    const goalScores = new Map<string, GoalHit>();
    const bump = (goalId: string, score: number, via: { id: string; hops: number }) => {
      const n = graph.nodes.get(goalId)!;
      const g = goalScores.get(goalId) ?? { id: goalId, title: n.title, summary: n.summary, score: 0, relevance: 0, via: [] };
      g.score = Math.max(g.score, score);
      g.via.push(via);
      goalScores.set(goalId, g);
    };
    for (const r of raw) {
      const id = String(r.id);
      if (r.type === "goal") bump(id, r.score, { id: "self", hops: 0 });
      else for (const [goalId, hops] of goalsOf(id)) bump(goalId, r.score * HOP_DECAY ** hops, { id, hops });
    }

    const min = opts.minRelevance ?? 0.05;
    const filtered = types ? raw.filter((r) => types.has(r.type)) : raw;
    const top = filtered[0]?.score ?? 1;
    const hits: SearchHit[] = filtered
      .filter((r) => r.score / top >= min)
      .slice(0, opts.limit ?? 10)
      .map((r) => ({
        id: String(r.id),
        type: r.type,
        title: r.title,
        summary: r.summary,
        score: r.score,
        relevance: r.score / top,
        matched: r.match as Record<string, Field[]>,
        goals: r.type === "goal" ? [] : [...goalsOf(String(r.id)).keys()],
      }));

    const rawTop = raw[0].score;
    const goals = [...goalScores.values()]
      .map((g) => ({ ...g, relevance: g.score / rawTop, via: g.via.sort((a, b) => a.hops - b.hops).slice(0, MAX_VIA) }))
      .filter((g) => g.relevance >= min)
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.goalLimit ?? 5);
    return { query, hits, goals };
  };

  return { search, goalsOf };
}
