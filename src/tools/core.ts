import * as ajv2020 from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv/dist/2020.js";
import { lintKB } from "../lint.js";
import { renderResolvedGoal } from "../render.js";
import { resolveGoal, resolveProcedure, type ResolveOptions } from "../resolve.js";
import { createSearchIndex, type KBSearch } from "../search.js";
import { EDGE_KINDS, NODE_TYPES, type EdgeKind, type KBGraph, type NodeType } from "../types.js";

const Ajv2020 = ajv2020.default.default ?? ajv2020.default;

/** Provider-agnostic tool definition (maps 1:1 to MCP, Anthropic, and OpenAI tool formats). */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; openWorldHint?: boolean; title?: string };
}

export interface ToolResult {
  /** Markdown (resolve_*) or compact JSON (everything else). */
  content: string;
  isError?: boolean;
}

export interface KBStatus {
  root: string;
  nodes: number;
  edges: number;
  errors: number;
  warnings: number;
}

export interface KBTools {
  definitions: ToolDefinition[];
  call(name: string, args: unknown): ToolResult;
  status: KBStatus;
}

// ---------- schemas ----------

const resolveProps = {
  states: {
    type: "object",
    description: 'Known state values, e.g. {"state.channel.zalo-connected": true}. Omitted states are unknown and produce CHECK steps.',
    additionalProperties: { type: "boolean" },
  },
  plan: { type: "string", description: "Tenant plan (e.g. \"pro\"), used for availability. Omit if unknown." },
  permissions: { type: "array", items: { type: "string" }, description: "Tenant/user permissions, used for availability." },
  choices: {
    type: "object",
    description: 'Pre-selected options for CHOOSE steps: {"<choiceId>": "<optionKey>"} or {"<procedureId>:<choiceId>": "<optionKey>"}.',
    additionalProperties: { type: "string" },
  },
  token_budget: { type: "integer", minimum: 200, maximum: 8000, default: 2000, description: "Approximate size limit for the returned plan." },
} as const;

const idProp = (what: string) => ({ type: "string", minLength: 1, description: `${what} id, e.g. from search_kb results.` });
const readOnly = { readOnlyHint: true, openWorldHint: false };

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "search_kb",
    description:
      "Search the product knowledge base (Vietnamese or English, diacritics optional). " +
      "Start here for any user request about what the product can do or how to achieve something. " +
      "Returns `goals` (ranked entry points; pass the best one to resolve_goal) and `hits` (matching nodes of any type). " +
      "A hit with type `procedure` and no goals is a standalone procedure; use resolve_procedure for it.",
    inputSchema: {
      type: "object",
      required: ["query"],
      additionalProperties: false,
      properties: {
        query: { type: "string", minLength: 1, description: "The user's intent in their own words." },
        types: { type: "array", items: { enum: [...NODE_TYPES] }, uniqueItems: true, description: "Restrict hits to these node types." },
        limit: { type: "integer", minimum: 1, maximum: 25, default: 8 },
      },
    },
    annotations: { ...readOnly, title: "Search KB" },
  },
  {
    name: "resolve_goal",
    description:
      "Turn a goal id into an ordered, actionable plan: CHECK steps for unknown states, conditional fix steps, " +
      "CHOOSE steps for branches (with each option's sub-plan), constraints, and ranked alternatives. " +
      "Pass what you already know (states, tenant plan/permissions, chosen options) to get a shorter plan. Returns Markdown.",
    inputSchema: {
      type: "object",
      required: ["goal_id"],
      additionalProperties: false,
      properties: { goal_id: idProp("Goal"), ...resolveProps },
    },
    annotations: { ...readOnly, title: "Resolve goal" },
  },
  {
    name: "resolve_procedure",
    description:
      "Same as resolve_goal for a single procedure id. Use for standalone procedures found by search_kb " +
      "(e.g. setup or fix procedures with no goal). Returns Markdown.",
    inputSchema: {
      type: "object",
      required: ["procedure_id"],
      additionalProperties: false,
      properties: { procedure_id: idProp("Procedure"), ...resolveProps },
    },
    annotations: { ...readOnly, title: "Resolve procedure" },
  },
  {
    name: "get_node",
    description:
      "Read one KB node: metadata, type-specific fields (when_to_use, check, severity, choices), outgoing and incoming edges by kind, and the Markdown body. " +
      "Use for details a plan omitted, such as a constraint's full rules.",
    inputSchema: {
      type: "object",
      required: ["id"],
      additionalProperties: false,
      properties: {
        id: idProp("Node"),
        max_body_chars: { type: "integer", minimum: 0, maximum: 20000, default: 3000, description: "0 omits the body." },
      },
    },
    annotations: { ...readOnly, title: "Get node" },
  },
  {
    name: "get_related",
    description:
      "Explore the neighborhood of a node (breadth-first). Use to answer questions like " +
      '"what depends on X?" (direction "in") or "what does X need?" (direction "out"). Edges are returned as [from, kind, to].',
    inputSchema: {
      type: "object",
      required: ["id"],
      additionalProperties: false,
      properties: {
        id: idProp("Node"),
        depth: { type: "integer", minimum: 1, maximum: 3, default: 2 },
        direction: { enum: ["out", "in", "both"], default: "both" },
        kinds: { type: "array", items: { enum: [...EDGE_KINDS] }, uniqueItems: true, description: "Only follow these edge kinds." },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 40, description: "Max nodes returned." },
      },
    },
    annotations: { ...readOnly, title: "Get related" },
  },
];

export interface KBToolsOptions {
  /**
   * Expose `plan` / `permissions` on resolve_* tools (default true).
   * When false they are removed from the schemas (and rejected if sent); availability is then null where gated.
   */
  tenantContext?: boolean;
}

/** Tool definitions for the given options (copies; TOOL_DEFINITIONS is never mutated). */
export function buildDefinitions(opts: KBToolsOptions = {}): ToolDefinition[] {
  const defs: ToolDefinition[] = structuredClone(TOOL_DEFINITIONS);
  if (opts.tenantContext === false) {
    for (const d of defs.filter((d) => d.name.startsWith("resolve_"))) {
      const props = d.inputSchema.properties as Record<string, unknown>;
      delete props.plan;
      delete props.permissions;
      d.description = d.description.replace("(states, tenant plan/permissions, chosen options)", "(states, chosen options)");
    }
  }
  return defs;
}

// ---------- helpers ----------

const json = (v: unknown): ToolResult => ({ content: JSON.stringify(v, (_, x) => (Array.isArray(x) && x.length === 0 ? undefined : x)) });
const fail = (msg: string): ToolResult => ({ content: msg, isError: true });
const r2 = (n: number) => Math.round(n * 100) / 100;

const COMMON_KEYS = new Set(["id", "type", "title", "summary", "aliases", "tags", "status", "availability", ...EDGE_KINDS]);

function groupEdges(edges: { kind: EdgeKind; id: string }[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const e of edges) (out[e.kind] ??= []).includes(e.id) || out[e.kind].push(e.id);
  return out;
}

class ToolError extends Error {}

// ---------- factory ----------

/** Loads and indexes the KB once, then serves tool calls from memory. */
export async function createKBTools(root: string, opts: KBToolsOptions = {}): Promise<KBTools> {
  const definitions = buildDefinitions(opts);
  const { graph, errorCount, warningCount } = await lintKB(root);
  const search = createSearchIndex(graph);
  const status: KBStatus = { root, nodes: graph.nodes.size, edges: graph.edges.length, errors: errorCount, warnings: warningCount };

  const ajv = new Ajv2020({ allErrors: true, strict: false, useDefaults: true });
  const validators = new Map<string, ValidateFunction>(definitions.map((d) => [d.name, ajv.compile(d.inputSchema)]));

  const handlers: Record<string, (a: any) => ToolResult> = {
    search_kb: (a) => {
      const r = search.search(a.query, { types: a.types as NodeType[] | undefined, limit: a.limit });
      return json({
        goals: r.goals.map((g) => ({ id: g.id, title: g.title, relevance: r2(g.relevance) })),
        hits: r.hits.map((h) => ({ id: h.id, type: h.type, title: h.title, summary: h.summary, relevance: r2(h.relevance), goals: h.goals })),
      });
    },
    resolve_goal: (a) => {
      const node = requireNode(graph, search, a.goal_id, "goal");
      return renderPlan(resolveGoal(graph, node, resolveOpts(a)), a.token_budget);
    },
    resolve_procedure: (a) => {
      const node = requireNode(graph, search, a.procedure_id, "procedure");
      return renderPlan(resolveProcedure(graph, node, resolveOpts(a)), a.token_budget);
    },
    get_node: (a) => {
      const id = requireNode(graph, search, a.id);
      const n = graph.nodes.get(id)!;
      const fields = Object.fromEntries(Object.entries(n.data).filter(([k]) => !COMMON_KEYS.has(k)));
      const body = n.body.trim();
      const max: number = a.max_body_chars;
      return json({
        id: n.id,
        type: n.type,
        title: n.title,
        summary: n.summary,
        status: n.status === "deprecated" ? "deprecated" : undefined,
        aliases: n.aliases,
        tags: n.tags,
        availability: n.availability,
        fields: Object.keys(fields).length ? fields : undefined,
        out: groupEdges(graph.out.get(id)!.map((e) => ({ kind: e.kind, id: e.to }))),
        in: groupEdges(graph.in.get(id)!.map((e) => ({ kind: e.kind, id: e.from }))),
        body: max > 0 && body ? body.slice(0, max) : undefined,
        body_truncated: max > 0 && body.length > max ? true : undefined,
      });
    },
    get_related: (a) => {
      const id = requireNode(graph, search, a.id);
      const kinds = a.kinds ? new Set<EdgeKind>(a.kinds) : null;
      const dist = new Map([[id, 0]]);
      const edges = new Map<string, [string, EdgeKind, string]>();
      let frontier = [id];
      let truncated = false;
      for (let d = 1; d <= a.depth && frontier.length; d++) {
        const next: string[] = [];
        for (const cur of frontier) {
          const cand = [
            ...(a.direction !== "in" ? graph.out.get(cur)!.map((e) => [e, e.to] as const) : []),
            ...(a.direction !== "out" ? graph.in.get(cur)!.map((e) => [e, e.from] as const) : []),
          ];
          for (const [e, other] of cand) {
            if ((kinds && !kinds.has(e.kind)) || !graph.nodes.has(other)) continue;
            if (!dist.has(other)) {
              if (dist.size >= a.limit) {
                truncated = true;
                continue;
              }
              dist.set(other, d);
              next.push(other);
            }
            edges.set(`${e.from}|${e.kind}|${e.to}`, [e.from, e.kind, e.to]);
          }
        }
        frontier = next;
      }
      return json({
        root: id,
        nodes: [...dist].map(([nid, distance]) => {
          const n = graph.nodes.get(nid)!;
          return { id: nid, type: n.type, title: n.title, distance };
        }),
        edges: [...edges.values()].filter(([f, , t]) => dist.has(f) && dist.has(t)),
        truncated: truncated || undefined,
      });
    },
  };

  const call = (name: string, args: unknown): ToolResult => {
    const handler = handlers[name];
    const validate = validators.get(name);
    if (!handler || !validate) return fail(`Unknown tool "${name}". Available: ${definitions.map((d) => d.name).join(", ")}`);
    const input = structuredClone(args ?? {});
    if (!validate(input)) {
      const msg = (validate.errors ?? []).map((e) => `${e.instancePath || "(args)"} ${e.message}`).join("; ");
      return fail(`Invalid arguments for ${name}: ${msg}`);
    }
    try {
      const result = handler(input);
      if (status.errors && !result.isError)
        result.content = `[KB has ${status.errors} lint error(s); results may be incomplete]\n${result.content}`;
      return result;
    } catch (err) {
      if (err instanceof ToolError) return fail(err.message);
      return fail(`Internal error in ${name}: ${(err as Error).message}`);
    }
  };

  return { definitions, call, status };
}

function resolveOpts(a: any): ResolveOptions {
  return {
    states: a.states,
    choices: a.choices,
    tenant: a.plan || a.permissions ? { plan: a.plan, permissions: a.permissions } : undefined,
  };
}

function renderPlan(r: ReturnType<typeof resolveGoal>, budget: number): ToolResult {
  return { content: renderResolvedGoal(r, { tokenBudget: budget }).text };
}

/** Returns the id if it exists (and has the expected type), else throws a ToolError with suggestions. */
function requireNode(graph: KBGraph, search: KBSearch, id: string, type?: NodeType): string {
  const n = graph.nodes.get(id);
  if (n && (!type || n.type === type)) return id;
  if (n && type) {
    const hint = n.type === "procedure" ? " Use resolve_procedure." : n.type === "goal" ? " Use resolve_goal." : "";
    throw new ToolError(`"${id}" is a ${n.type}, not a ${type}.${hint}`);
  }
  const query = id.split(".").slice(1).join(" ").replace(/-/g, " ") || id;
  const similar = search
    .search(query, { types: type ? [type] : undefined, limit: 3 })
    .hits.map((h) => h.id);
  throw new ToolError(`Node "${id}" not found.${similar.length ? ` Did you mean: ${similar.join(", ")}?` : " Use search_kb to find ids."}`);
}
